/* bitforge — TTF builder (chunk [Z], DECISIONS #82). Pure-module tests.
 * Strategy: build a small known font, run it through BF_TTF.build, then
 * PARSE the result back with a minimal sfnt reader in this file — that way
 * the tests catch layout bugs (table misalignment, off-by-ones, wrong
 * encodings), not just "it produced some bytes". */

var TTF = globalThis.BF_TTF;
assert(TTF, "BF_TTF must be a global after loading js/ttf.js");

/* ---------- minimal big-endian readers ---------- */
function t16(b, o) { return (b[o] << 8) | b[o + 1]; } // big-endian
function t16s(b, o) { var v = t16(b, o); return v >= 0x8000 ? v - 0x10000 : v; }
function t32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }

// Table directory -> { tag: { off, len, chk } }
function ttfTables(b) {
  var n = t16(b, 4), out = {}, i, o, tag; // sfnt: version(4) then numTables
  assertEqual(t32(b, 0), 0x00010000, "sfnt magic = TrueType");
  for (i = 0; i < n; i++) {
    o = 12 + i * 16;
    tag = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    out[tag] = { off: t32(b, o + 8), len: t32(b, o + 12), chk: t32(b, o + 4) };
  }
  return out;
}

// cmap format-4 lookup, the way a renderer does it (binary search +
// idRangeOffset pool). Returns the glyph index, or null = unmapped.
function cmapGlyph(b, cmap, code) {
  // cmap header: version(2) numTables(2) then per subtable: plat(2) enc(2) offset(4).
  // Single (3,1) subtable ⇒ platform at +4, encoding at +6, offset at +8.
  assertEqual(t16(b, cmap.off + 4), 3, "cmap: platform 3 (Windows)");
  assertEqual(t16(b, cmap.off + 6), 1, "cmap: encoding 1 (Unicode)");
  var base = cmap.off + t32(b, cmap.off + 8);
  assertEqual(t16(b, base), 4, "cmap subtable must be format 4");
  assertEqual(t16(b, base + 4), 0, "subtable language 0");
  var segCount = t16(b, base + 6) / 2, i;
  var ends = [], starts = [], deltas = [], ranges = [];
  var o = base + 14;
  for (i = 0; i < segCount; i++) ends.push(t16(b, o + 2 * i));
  o += segCount * 2 + 2; // skip reservedPad
  for (i = 0; i < segCount; i++) starts.push(t16(b, o + 2 * i));
  o += segCount * 2;
  for (i = 0; i < segCount; i++) deltas.push(t16s(b, o + 2 * i));
  o += segCount * 2;
  for (i = 0; i < segCount; i++) ranges.push(t16(b, o + 2 * i));
  var lo = 0, hi = segCount, mid;
  while (lo < hi) { mid = (lo + hi) >> 1; if (code <= ends[mid]) hi = mid; else lo = mid + 1; }
  if (lo >= segCount || code < starts[lo]) return null;
  var r = ranges[lo];
  if (!r) return (code + deltas[lo]) & 0xffff;
  // Spec: idRangeOffset is relative to THIS segment's own idRangeOffset field
  // (o is the array start), so add 2*lo for this segment's field position.
  var g = t16(b, o + 2 * lo + r + (code - starts[lo]) * 2);
  return g ? (g + deltas[lo]) & 0xffff : null;
}

// glyf simple glyph. DECODES COORDINATES PER THE SPEC USING THE FLAGS:
//   0x01 on-curve | 0x02 x SHORT (1 byte) | 0x04 y SHORT (1 byte) | 0x08 repeat
//   0x10 x same-as-previous (or: positive short x) | 0x20 y same-as-previous
//   (or: positive short y)
// A 16-bit signed delta appears only when its SHORT bit is CLEAR and its SAME
// bit is CLEAR. This reader is spec-conformant rather than an echo of the
// builder — a wrong flag byte (0x07 sets the SHORT bits, 0x10 is x-same)
// decodes to garbage / "excess bytes" here. All x values are decoded first,
// then all y values (the spec's coordinate layout).
function parseGlyph(b, off) {
  var n = t16s(b, off);
  if (n <= 0) return { n: n, bbox: null, ends: [], pts: 0, flags: [], xs: [], ys: [] };
  // glyf: numContours(2) xMin(2) yMin(2) xMax(2) yMax(2) endPts... instrLen(2)
  var bbox = [t16s(b, off + 2), t16s(b, off + 4), t16s(b, off + 6), t16s(b, off + 8)];
  var ends = [], i;
  for (i = 0; i < n; i++) ends.push(t16(b, off + 10 + 2 * i));
  var pts = ends[ends.length - 1] + 1;
  var o = off + 10 + 2 * n + 2; // skip instructionLength
  var flags = [];
  for (i = 0; i < pts; i++) flags.push(b[o + i]);
  o += pts;
  // SHORT-vector magnitude (spec: value 0x01/0x02 is a short code — the real
  // 1-byte magnitude is the following byte; the SIGN comes from the 0x10/0x20
  // flag bit, applied by the caller).
  function d8pos() {
    var c0 = b[o++];
    if (c0 === 1 || c0 === 2) return b[o++];
    return c0;
  }
  var xs = [], ys = [], px = 0, py = 0, f, d;
  for (i = 0; i < pts; i++) {
    f = flags[i];
    assert(!(f & 0x08), "repeat flag 0x08 unsupported by this reader (builder must not emit it)");
    if (f & 0x02) d = (f & 0x10) ? d8pos() : -d8pos(); // x SHORT (1 byte, sign from 0x10)
    else if (f & 0x10) d = 0;                          // x same as previous
    else { d = t16s(b, o); o += 2; }                    // 16-bit x delta
    px += d; xs.push(px);
  }
  for (i = 0; i < pts; i++) {
    f = flags[i];
    if (f & 0x04) d = (f & 0x20) ? d8pos() : -d8pos(); // y SHORT (1 byte, sign from 0x20)
    else if (f & 0x20) d = 0;                           // y same as previous
    else { d = t16s(b, o); o += 2; }                     // 16-bit y delta
    py += d; ys.push(py);
  }
  return { n: n, bbox: bbox, ends: ends, pts: pts, flags: flags, xs: xs, ys: ys };
}

// name table: find nameID (platform 3 / encoding 1), decode UTF-16BE.
function nameGet(b, name, nameId) {
  // Spec: name header = format(2) numStrings(2) stringOffset(2); records at +6.
  // Record: plat(2) enc(2) lang(2) nameID(2) length(2) offset(2).
  var n = t16(b, name.off + 2), poolOff = t16(b, name.off + 4), i, o, len, so, s;
  for (i = 0; i < n; i++) {
    o = name.off + 6 + 12 * i;
    if (t16(b, o + 6) !== nameId) continue;
    len = t16(b, o + 8); so = t16(b, o + 10); s = ""; // so is POOL-relative
    for (var j = 0; j + 1 < len; j += 2) s += String.fromCharCode(t16(b, name.off + poolOff + so + j));
    return s;
  }
  return null;
}

// base64 decode (inverse of TTF.base64; strips padding).
function b64decode(s) {
  var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var idx = {}, i;
  for (i = 0; i < A.length; i++) idx[A.charAt(i)] = i;
  s = s.replace(/[^A-Za-z0-9+\/]/g, "");
  var out = [], acc = 0, n = 0;
  for (i = 0; i < s.length; i++) {
    acc = (acc << 6) | idx[s.charAt(i)]; n += 6;
    if (n >= 8) { n -= 8; out.push((acc >> n) & 0xff); }
  }
  return new Uint8Array(out);
}

// ---------- fixture fonts ----------
// 8x16: 'A' = vertical bar x=0 rows 2..5; 'B' = single pixel top-right.
function sampleFont() {
  var f = BF.makeFont(8, 16), y;
  for (y = 2; y <= 5; y++) BF.setPixel(f, 0x41, 0, y, 1);
  BF.setPixel(f, 0x42, 7, 0, 1);
  return f;
}
function inkAll(f) {
  var c, x, y;
  for (c = 0; c < BF.NUM_GLYPHS; c++)
    for (y = 0; y < f.height; y++)
      for (x = 0; x < f.width; x++) BF.setPixel(f, c, x, y, 1);
  return f;
}

/* ---------- tests ---------- */

test("ttf: structural sanity — 10 tables, 4-aligned offsets, per-table checksums", function () {
  var b = TTF.build(sampleFont(), "bf-test"), t = ttfTables(b), i;
  var want = ["cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name", "OS/2", "post"];
  for (i = 0; i < want.length; i++) assert(t[want[i]], "table present: " + want[i]);
  assertEqual(Object.keys(t).length, 10, "exactly 10 tables");
  for (i = 0; i < want.length; i++) {
    var e = t[want[i]];
    assert(e.off % 4 === 0, "4-aligned offset: " + want[i]);
    assert(e.off + e.len <= b.length, "in bounds: " + want[i]);
    var slice = b.subarray ? b.subarray(e.off, e.off + e.len) : new Uint8Array(b.slice(e.off, e.off + e.len));
    assertEqual(TTF.checksum4(slice), e.chk, "directory checksum matches: " + want[i]);
  }
});

test("ttf: table directory — searchRange/rangeShift formula + tags ascending (OTS invariants)", function () {
  // Chromium's OTS rejects these ("bad table directory searchRange",
  // "bad table directory rangeShift", "Table directory is not correctly
  // ordered") — CoreText does not, which is how this class of bug shipped
  // (regression [Z.2], Windows/Chromium report). Spec: directory records are
  // 16 bytes wide ⇒ searchRange = 16 x 2^floor(log2 numTables),
  // rangeShift = numTables*16 - searchRange; tags sorted ascending.
  var b = TTF.build(sampleFont(), "bf-test");
  var n = t16(b, 4), power = 1, es = 0;
  while (power * 2 <= n) { power *= 2; es++; }
  assertEqual(t16(b, 6), power * 16, "searchRange = 16 x 2^entrySelector (was 2 x — the cmap formula)");
  assertEqual(t16(b, 8), es, "entrySelector = floor(log2 numTables)");
  assertEqual(t16(b, 10), n * 16 - power * 16, "rangeShift = numTables*16 - searchRange");
  var prev = "", i, tag;
  for (i = 0; i < n; i++) {
    tag = String.fromCharCode(b[12 + i * 16], b[13 + i * 16], b[14 + i * 16], b[15 + i * 16]);
    assert(tag > prev, "tags strictly ascending: '" + prev + "' < '" + tag + "'");
    prev = tag;
  }
  assertEqual(prev, "post", "last tag is 'post' (OS/2 sorts FIRST, before cmap)");
});

test("ttf: checkSumAdjustment — directory checksums sum to 0xB1B0AFBA", function () {
  // Spec invariant: the SUM OF THE DIRECTORY TABLE CHECKSUMS is 0xB1B0AFBA.
  var b = TTF.build(sampleFont(), "bf-test"), t = ttfTables(b), sum = 0, k;
  for (k in t) sum = (sum + t[k].chk) >>> 0;
  assertEqual(sum, 0xB1B0AFBA, "sum of directory table checksums");
});

test("ttf: checksum4 — pinned against spec vectors (incl. partial tail words)", function () {
  // OpenType spec: checksum4 = sum of 4-byte BIG-ENDIAN unsigned words over
  // COMPLETE words only; a trailing 1-3 bytes are ignored.
  // (Regression: a loop bounded by i < length folds the partial tail into a
  //  bogus word — CoreText rejects such fonts. Vectors below were computed
  // by hand / independently and are NOT derived from TTF.checksum4.)
  assertEqual(TTF.checksum4([0, 0, 0, 0]), 0, "all zeros");
  assertEqual(TTF.checksum4([0, 0, 0, 1]), 1, "single word 0x00000001");
  assertEqual(TTF.checksum4([0, 0, 0, 1, 0, 0, 0, 2]), 3, "two words 1+2");
  assertEqual(TTF.checksum4([0x80, 0, 0, 0]), 0x80000000, "unsigned 0x80000000");
  assertEqual(TTF.checksum4([0x00, 0xC0]), 0, "2-byte tail is IGNORED (was the bug)");
  assertEqual(TTF.checksum4([0xFF]), 0, "1-byte tail is IGNORED");
  assertEqual(TTF.checksum4([0, 0xC0, 0, 0]), 0x00C00000, "same bytes as a full word count");
  // The real 10-byte loca table of the sample font: words 0x00000000 + 0x00020066.
  assertEqual(TTF.checksum4([0, 0, 0, 0, 0, 2, 0, 0x66, 0, 0x88]), 0x00020066, "loca bytes");
});

test("ttf: head — v1.0 (54 bytes), spec offsets, em, magic, bbox, loca format", function () {
  var f = sampleFont(), b = TTF.build(f, "bf-test"), t = ttfTables(b), h = t.head;
  // head v1.0 is EXACTLY 54 bytes (spec; independently verified against a
  // known-good system font whose head table is 54 bytes):
  //   0  version(4)          4  fontRevision(4)
  //   8  checkSumAdj(4)      12 magic(4)
  //  16  flags(2)            18 unitsPerEm(2)
  //  20  created(8)          28 modified(8)     — 8-byte LongDateTimes
  //  36  xMin(2) yMin(2) xMax(2) yMax(2)        — font bounding box
  //  44  macStyle(2)         46 lowestRecPPEM(2)
  //  48  fontDirectionHint(2)  50 indexToLocFormat(2)
  //  52  glyphDataFormat(2)
  // (head has NO win-bounding-box; win ascent/descent live in OS/2.)
  assertEqual(t.head.len, 54, "head v1.0 = 54 bytes (CoreText rejects other lengths)");
  assertEqual(t32(b, h.off + 12), 0x5f0f3cf5, "head magic");
  assertEqual(t16(b, h.off + 18), 1024, "unitsPerEm = 16px * 64");
  assertEqual(t16(b, h.off + 18) % f.height, 0, "em is an exact multiple of the glyph height");
  // font bbox at 36/38/40/42 (AFTER the two 8-byte LongDateTimes at 20/28)
  assertEqual(t16s(b, h.off + 36), 0, "xMin");
  assertEqual(t16s(b, h.off + 38), 448, "yMin = (13-5-1)*64 ('A' bottom row)");
  assertEqual(t16s(b, h.off + 40), 512, "xMax = 8px * 64");
  assertEqual(t16s(b, h.off + 42), 832, "yMax = 13 * 64");
  assertEqual(t16(b, h.off + 44), 0, "macStyle 0 (roman)");
  assertEqual(t16(b, h.off + 46), 8, "lowestRecPPEM");
  var long = t16s(b, h.off + 50); // indexToLocFormat is at 50
  assertEqual(long, 0, "short loca for this small font");
  assertEqual(t16(b, h.off + 52), 0, "glyphDataFormat 0 (simple glyphs)");
  assertEqual(t.loca.len, 5 * (long ? 4 : 2), "loca size = 5 offsets (4 glyphs + 1)");
});

test("ttf: hhea — EXACTLY 36 bytes, canonical layout at spec offsets", function () {
  // hhea v1.0 is EXACTLY 36 bytes — canonical layout per the OpenType spec,
  // verified field-by-field against fontTools' hheaFormat (the oracle):
  //   0  tableVersion(4) = 0x00010000 — 4-byte fixed 1.0, NOT two FWORDs
  //   4  ascent(2)  6  descent(2)  8  lineGap(2)
  //  10  advanceWidthMax(2)
  //  12  minLeftSideBearing(2)  14  minRightSideBearing(2)  16  xMaxExtent(2)
  //  18  caretSlopeRise(2)  20  caretSlopeRun(2)  22  caretOffset(2)
  //  24  reserved0..reserved3 (4 × 2 bytes)
  //  32  metricDataFormat(2)  34  numberOfHMetrics(2)
  // (The previous test asserted the fabricated "18 FWORDs" layout — hhea has
  // no unitsPerEm/font-bbox/macStyle; those live in head. Readers of the
  // canonical layout read ascent/descent from bytes 4..8 — that's the
  // baseline/line-box bug this test now guards.)
  var b = TTF.build(sampleFont(), "bf-test"), t = ttfTables(b), h = t.hhea;
  assertEqual(h.len, 36, "hhea = 36 bytes (spec: 4 + 16 × 2)");
  assertEqual(t32(b, h.off + 0), 0x00010000, "tableVersion = 1.0 (4-byte fixed)");
  assertEqual(t16s(b, h.off + 4), 832, "ascent = base*upx = 13*64");
  assertEqual(t16s(b, h.off + 6), -192, "descent = -(height-base)*upx = -3*64");
  assertEqual(t16s(b, h.off + 8), 0, "lineGap = 0");
  assertEqual(t16(b, h.off + 10), 512, "advanceWidthMax = width*upx = 8*64");
  assertEqual(t16s(b, h.off + 12), 0, "minLeftSideBearing = 0 ('A' bar at x=0, notdef empty)");
  assertEqual(t16s(b, h.off + 14), 0, "minRightSideBearing = adv - xMax = 512 - 512");
  assertEqual(t16s(b, h.off + 16), 512, "xMaxExtent = font xMax ('B' pixel at x=7)");
  assertEqual(t16s(b, h.off + 18), 1, "caretSlopeRise = 1 (MUST be nonzero)");
  assertEqual(t16s(b, h.off + 20), 0, "caretSlopeRun = 0");
  assertEqual(t16s(b, h.off + 22), 0, "caretOffset = 0");
  assertEqual(t16s(b, h.off + 24), 0, "reserved0 = 0");
  assertEqual(t16s(b, h.off + 26), 0, "reserved1 = 0");
  assertEqual(t16s(b, h.off + 28), 0, "reserved2 = 0");
  assertEqual(t16s(b, h.off + 30), 0, "reserved3 = 0");
  assertEqual(t16s(b, h.off + 32), 0, "metricDataFormat = 0");
  assertEqual(t16(b, h.off + 34), 4, "numberOfHMetrics = 4 slots");
});

test("ttf: OS/2 — v4 (96 bytes), spec field order incl. sub/superscript after fsType", function () {
  // Chromium's OTS reads the subscript/superscript/strikeout/familyClass
  // fields right after fsType for EVERY OS/2 version — the legacy 56-byte v0
  // layout (panose directly after fsType) fails its parse ("OS/2: Error
  // reading more basic table fields"). CoreText accepts the legacy layout,
  // which is how that one shipped. We emit v4 (96 bytes), spec order:
  //   0 ulVersion(2)=4  2 xAvgCharWidth  4 usWeightClass  6 usWidthClass
  //   8 fsType  10 ySubscript{XSize,YSize,XOff,YOff}  18 ySuperscript{...}
  //  26 yStrikeout{Size,Pos}  30 sFamilyClass  32 panose(10)
  //  42 UR1..4  58 achVendID  62 fsSelection  64 usFirstCharIndex
  //  66 usLastCharIndex  68 sTypoAscender  70 sTypoDescender  72 sTypoLineGap
  //  74 usWinAscent  76 usWinDescent  78 ulCodePageRange1  82 ulCodePageRange2
  //  86 sxHeight  88 sCapHeight  90 usDefaultChar  92 usBreakChar  94 usMaxContext
  var b = TTF.build(sampleFont(), "bf-test"), t = ttfTables(b), o = t["OS/2"].off;
  assertEqual(t["OS/2"].len, 96, "OS/2 v4 = 96 bytes (OTS reads the v4 layout for all versions)");
  assertEqual(t16(b, o), 4, "ulVersion 4");
  assertEqual(t16(b, o + 2), 512, "xAvgCharWidth = width*upx");
  assertEqual(t16(b, o + 4), 400, "usWeightClass regular");
  assertEqual(t16(b, o + 6), 5, "usWidthClass medium");
  assertEqual(t16(b, o + 8), 0, "fsType");
  assertEqual(t16s(b, o + 10), 0, "ySubscriptXSize — the v4 field that must follow fsType");
  assertEqual(t16(b, o + 58), 0x4246, "achVendID 'BF'");
  assertEqual(t16(b, o + 62), 0x40, "fsSelection bit 6 = REGULAR (bit 0 is ITALIC — writing 1 there made OTS 'adjust head.macStyle (italic)')");
  assertEqual(t16(b, o + 64), 0, "usFirstCharIndex");
  assertEqual(t16(b, o + 66), 255, "usLastCharIndex");
  assertEqual(t16s(b, o + 68), 832, "sTypoAscender");
  assertEqual(t16s(b, o + 70), -192, "sTypoDescender");
  assertEqual(t16s(b, o + 72), 0, "sTypoLineGap");
  assertEqual(t16(b, o + 74), 832, "usWinAscent");
  assertEqual(t16(b, o + 76), 192, "usWinDescent");
  assertEqual(t32(b, o + 78), 1, "ulCodePageRange1 bit0 (Windows Latin1)");
  assertEqual(t16(b, o + 90), 0x20, "usDefaultChar = space");
  assertEqual(t16(b, o + 92), 0x20, "usBreakChar = space");
  assertEqual(t16(b, o + 94), 1, "usMaxContext");
});

test("ttf: post — v3.0 is EXACTLY 32 bytes (no glyphNameIndex)", function () {
  // OpenType spec, post v3.0: "If the version is 1.0 or 3.0, the table ends
  // here." So v3.0 = 16 common bytes + 4 uint32 memory-limit fields = 32 B.
  // There is NO numberOfGlyphs and NO glyphNameIndex in v3.0 (those are
  // v1.0/2.0 only). Confirmed against the normative table + harfbuzz/freetype.
  //   0  version(4)   4  italicAngle(4)   8  underlinePosition(2)
  //  10 underlineThickness(2)  12 isFixedPitch(4)
  //  16 minMemType42(4)  20 maxMemType42(4)  24 minMemType1(4)  28 maxMemType1(4)
  var b = TTF.build(sampleFont(), "bf-test"), t = ttfTables(b), p = t.post.off;
  assertEqual(t32(b, p), 0x00030000, "post v3");
  assertEqual(t32(b, p + 4), 0, "italicAngle = 0 (upright)");
  assertEqual(t16s(b, p + 8), -4096, "underlinePosition = (-192-64)/1024 * 16384");
  assertEqual(t16s(b, p + 10), 1024, "underlineThickness = 1px in em/16 fractions");
  assertEqual(t32(b, p + 12), 1, "isFixedPitch");
  assertEqual(t32(b, p + 16), 0, "minMemType42 = 0 (unknown)");
  assertEqual(t32(b, p + 20), 0, "maxMemType42 = 0 (unknown)");
  assertEqual(t32(b, p + 24), 0, "minMemType1 = 0 (unknown)");
  assertEqual(t32(b, p + 28), 0, "maxMemType1 = 0 (unknown)");
  assertEqual(t.post.len, 32, "post v3.0 is EXACTLY 32 bytes");
});

test("ttf: maxp — v1.0 required for TrueType, per-glyph maxima", function () {
  var b = TTF.build(sampleFont(), "bf-test"), t = ttfTables(b), m = t.maxp.off;
  // v0.5 (0x00005000) is for CFF fonts — a TTF with maxp 0.5 is inconsistent
  // and strict readers reject it.
  assertEqual(t32(b, m), 0x00010000, "maxp v1.0 (TrueType)");
  assertEqual(t.maxp.len, 32, "maxp v1.0 = 32 bytes");
  assertEqual(t16(b, m + 4), 4, "numGlyphs");
  assertEqual(t16(b, m + 6), 16, "maxPoints = 'A's 4 contours * 4");
  assertEqual(t16(b, m + 8), 4, "maxContours = 'A'");
});

test("ttf: cmap — inked + space mapped, blanks unmapped (fallback rule)", function () {
  var b = TTF.build(sampleFont(), "bf-test"), t = ttfTables(b);
  assertEqual(cmapGlyph(b, t.cmap, 0x41), 2, "'A' -> slot 2");
  assertEqual(cmapGlyph(b, t.cmap, 0x42), 3, "'B' -> slot 3");
  assertEqual(cmapGlyph(b, t.cmap, 0x20), 1, "space -> slot 1 (blank but keeps advance)");
  // BLANK codes must come back UNMAPPED so the browser falls back per-codepoint.
  assertEqual(cmapGlyph(b, t.cmap, 0x00), null, "blank 0x00 unmapped");
  assertEqual(cmapGlyph(b, t.cmap, 0x30), null, "blank '0' unmapped");
  assertEqual(cmapGlyph(b, t.cmap, 0x7f), null, "blank 0x7f unmapped");
  // Beyond 8-bit: covered by the final [0x100..0xFFFF] delta segment (see the
  // dedicated final-segment test) — out-of-range there reads as unmapped.
});

test("ttf: cmap — final segment is the [0xFFFF,0xFFFF] terminator (OTS MUST)", function () {
  // Chromium's OTS: "cmap: Final segment start and end must be 0xFFFF". So
  // the last segment is the standard single-code terminator [0xFFFF,0xFFFF]
  // with idDelta=1 (→ glyph 0 = .notdef), and codes 0x100..0xFFFE sit in NO
  // segment ⇒ unmapped ⇒ .notdef/fallback. (The old [0x100..0xFFFF] delta
  // segment behaved the same for renderers but fails OTS's parse.)
  var b = TTF.build(sampleFont(), "bf-test"), t = ttfTables(b), cmap = t.cmap;
  var base = cmap.off + t32(b, cmap.off + 8);
  var segCount = t16(b, base + 6) / 2;
  assertEqual(t16(b, base + 14 + 2 * (segCount - 1)), 0xffff, "last endCode = 0xFFFF");
  // format-4 layout: endCode[] @ base+14 (n entries) → reservedPad @ base+14+2n
  // → startCode[] @ base+16+2n. So the LAST startCode is at base+16+2n + 2(n-1)
  // = base+16+4n-2 — NOT base+16+2(n-1) (that is the reservedPad slot, =0).
  // (Regression [Z.2]: the earlier offset read the reservedPad and always failed.)
  assertEqual(t16(b, base + 16 + 2 * segCount + 2 * (segCount - 1)), 0xffff, "last startCode = 0xFFFF (OTS requirement)");
  assertEqual(cmapGlyph(b, t.cmap, 0x100), null, "0x100 unmapped (no segment) → .notdef/fallback");
  assertEqual(cmapGlyph(b, t.cmap, 0xfffe), null, "0xFFFE unmapped → .notdef/fallback");
  assertEqual(cmapGlyph(b, t.cmap, 0xffff), 0, "0xFFFF → 0 (.notdef) via the terminator");
});

test("ttf: cmap — sparse mapping (mapped set does not start at 0)", function () {
  // The old identity-delta trick broke exactly here: only 0x20 and 0x80 inks.
  var f = BF.makeFont(4, 8);
  BF.setPixel(f, 0x80, 0, 0, 1);
  var b = TTF.build(f, "bf-sparse"), t = ttfTables(b);
  assertEqual(cmapGlyph(b, t.cmap, 0x80), 2, "0x80 -> slot 2");
  assertEqual(cmapGlyph(b, t.cmap, 0x20), 1, "space -> slot 1");
  assertEqual(cmapGlyph(b, t.cmap, 0x40), null, "0x40 unmapped");
  assertEqual(cmapGlyph(b, t.cmap, 0x7f), null, "0x7f unmapped");
  assertEqual(cmapGlyph(b, t.cmap, 0x81), null, "0x81 unmapped");
});

test("ttf: hmtx — one pair per slot, advances + real lsbs", function () {
  var b = TTF.build(sampleFont(), "bf-test"), t = ttfTables(b), o = t.hmtx.off;
  assertEqual(t.hmtx.len, 16, "4 slots * 4 bytes");
  // Pair layout: advanceWidth(2) then lsb(2).
  for (var s = 0; s < 4; s++)
    assertEqual(t16(b, o + s * 4), 512, "slot " + s + " advance");
  assertEqual(t16s(b, o + 2), 0, ".notdef lsb");
  assertEqual(t16s(b, o + 6), 0, "space lsb");
  assertEqual(t16s(b, o + 10), 0, "'A' lsb = 0");
  assertEqual(t16s(b, o + 14), 448, "'B' lsb = 7 * 64");
});

test("ttf: glyf/loca — offsets, point order, clockwise contours", function () {
  var b = TTF.build(sampleFont(), "bf-test"), t = ttfTables(b);
  var g = t.glyf, i;
  var n = t.loca.len / 2; // short loca (small font): 5 offsets for 4 glyphs
  // SHORT loca stores offsets in 16-bit WORDS — multiply by 2 for byte offsets.
  var loca = [];
  for (i = 0; i < n; i++) loca.push(t16(b, t.loca.off + i * 2) * 2);
  assertEqual(n, 5, "one offset per glyph + 1");
  assertEqual(loca[0], 0, "slot 0 at 0");
  assertEqual(loca[1], 0, "slot 1 (space, empty) at 0");
  assertEqual(loca[n - 1], t.glyf.len, "last loca == glyf length");

  // 'A' = slot 2: 4 contours (rows 2..5), 16 points, bbox known.
  var A = parseGlyph(b, g.off + loca[2]);
  assertEqual(A.n, 4, "'A' contour count");
  assertEqual(A.pts, 16, "'A' point count");
  assertEqual(A.bbox.join(","), "0,448,64,704", "'A' bbox");
  assertEqual(A.ends.join(","), "3,7,11,15", "'A' end points");
  for (i = 0; i < A.pts; i++) assertEqual(A.flags[i], 1, "flags: 0x01 (on-curve; SHORT bits 0x02/0x04 clear ⇒ 16-bit deltas; 0x07 would mean 1-byte deltas, 0x10 'x same as previous')");
  assertEqual(A.xs[0] + "," + A.ys[0], "0,640", "point 0 = (x0,yBot)");
  assertEqual(A.xs[1] + "," + A.ys[1], "0,704", "point 1 = (x0,yTop)");
  assertEqual(A.xs[2] + "," + A.ys[2], "64,704", "point 2 = (x1,yTop)");
  assertEqual(A.xs[3] + "," + A.ys[3], "64,640", "point 3 = (x1,yBot)");
  // Every contour must be CLOCKWISE in y-up (negative shoelace area).
  var e0 = -1, e;
  for (e = 0; e < A.n; e++) {
    var a = 0, j, p, q;
    var m = e === 0 ? 0 : A.ends[e - 1] + 1;
    for (j = m; j <= A.ends[e]; j++) {
      p = j; q = (j === A.ends[e]) ? m : j + 1;
      a += A.xs[p] * A.ys[q] - A.xs[q] * A.ys[p];
    }
    assert(a < 0, "contour " + e + " clockwise (area " + a + ")");
    e0 = e;
  }

  // 'B' = slot 3: 1 pixel -> 1 contour at x 448..512, y 768..832.
  var B = parseGlyph(b, g.off + loca[3]);
  assertEqual(B.n, 1, "'B' contour count");
  assertEqual(B.bbox.join(","), "448,768,512,832", "'B' bbox");
});

test("ttf: name table — family in nameID 1/4, PS name sanitized", function () {
  var b = TTF.build(sampleFont(), "bf-test"), t = ttfTables(b);
  assertEqual(nameGet(b, t.name, 1), "bf-test", "family");
  assertEqual(nameGet(b, t.name, 2), "Regular", "subfamily");
  assertEqual(nameGet(b, t.name, 4), "bf-test Regular", "full name");
  assertEqual(nameGet(b, t.name, 6), "bf-test", "PS name (alnum ok as-is)");
  var b2 = TTF.build(sampleFont(), "My Font (v2)"), t2 = ttfTables(b2);
  assertEqual(nameGet(b2, t2.name, 6), "MyFontv2", "PS name sanitized to [A-Za-z0-9_-]");
});

test("ttf: determinism — same font in, same bytes out", function () {
  var f = sampleFont();
  var a = TTF.build(f, "bf-test"), c = TTF.build(f, "bf-test");
  assertEqual(a.length, c.length, "same length");
  for (var i = 0; i < a.length; i++) assertEqual(a[i], c[i], "byte " + i);
  // A different family changes the name table only.
  var d = TTF.build(f, "other"), td = ttfTables(d);
  assert(td.name.off !== ttfTables(a).name.off || nameGet(d, td.name, 1) !== nameGet(a, ttfTables(a).name, 1),
    "family visible in name table");
});

test("ttf: baseline — 'base' guide wins, default h-3, clamped to 1..h-1", function () {
  var f = sampleFont();
  assertEqual(TTF.baselineOf(f), 13, "default = height - 3");
  f.guidelines.push({ o: "h", off: 10, label: "base", color: "#f00" });
  assertEqual(TTF.baselineOf(f), 10, "the font's own 'base' guide wins");
  f.guidelines.push({ o: "h", off: 7, label: "cap", color: "#0f0" });
  assertEqual(TTF.baselineOf(f), 10, "non-base guides are ignored");
  f.guidelines = [{ o: "h", off: 0, label: "base", color: "#00f" }];
  assertEqual(TTF.baselineOf(f), 1, "clamped to 1");
  f.guidelines = [{ o: "h", off: 99, label: "base", color: "#00f" }];
  assertEqual(TTF.baselineOf(f), 15, "clamped to height-1");
  f.guidelines = [];
});

test("ttf: baselineOf with duplicate 'base' guides — the canonical (last in array) wins [94]", function () {
  var f = sampleFont();
  f.guidelines = [
    { o: "h", off: 5,  label: "base", color: "#dd2222" },
    { o: "h", off: 9,  label: "base", color: "#dd2222" },
    { o: "h", off: 11, label: "base", color: "#dd2222" }
  ];
  assertEqual(TTF.baselineOf(f), 11, "the canonical guide (last in array order) wins — matches BF.guideCanonical");
  f.guidelines = [];
});

test("ttf: upxOf — em stays near 1024 and exact to the pixel", function () {
  assertEqual(TTF.upxOf(16), 64, "16 -> 64 (em 1024)");
  assertEqual(TTF.upxOf(12), 85, "12 -> 85 (em 1020)");
  assertEqual(TTF.upxOf(3), 341, "3 -> 341 (em 1023)");
  assertEqual(TTF.upxOf(1), 1024, "1 -> 1024 (em 1024)");
});

test("ttf: mappedCodes — 0x20 plus inked, ascending", function () {
  assertEqual(TTF.mappedCodes(sampleFont()).join(","), "32,65,66", "space + A + B");
  assertEqual(TTF.mappedCodes(inkAll(BF.makeFont(4, 4))).length, 256, "full ink = all 256");
});

test("ttf: full-ink font — 257 glyphs, long loca, every code mapped", function () {
  var f = inkAll(BF.makeFont(8, 16));
  var b = TTF.build(f, "bf-full"), t = ttfTables(b);
  assertEqual(t16(b, t.maxp.off + 4), 257, "256 mapped + .notdef");
  // 256 filled glyphs * 364 bytes + 2 (empty .notdef) = 93186 > 0xFFFF
  // => LONG loca is the only legal representation.
  assertEqual(t16(b, t.head.off + 50), 1, "long loca (glyf 93186 > 0xffff)");
  assertEqual(t.loca.len, 258 * 4, "long loca: 258 u32 offsets for 257 glyphs");
  for (var c = 0; c < 256; c++) assertEqual(cmapGlyph(b, t.cmap, c), c + 1, "code " + c + " -> slot " + (c + 1));
  assertEqual(t16s(b, t.head.off + 38), -192, "yMin = bottom row");
  assertEqual(t16(b, t.maxp.off + 6), 64, "maxPoints 16 runs * 4");
  assertEqual(t16(b, t.maxp.off + 8), 16, "maxContours 16 rows");
});

test("ttf: blank font — only 0x20 mapped, empty glyf, head bbox fallback", function () {
  var f = BF.makeFont(8, 16);
  var b = TTF.build(f, "bf-blank"), t = ttfTables(b);
  assertEqual(t16(b, t.maxp.off + 4), 2, "space + .notdef");
  assertEqual(t.glyf.len, 0, "all-empty font ⇒ glyf is empty (zero-length glyphs)");
  assertEqual(cmapGlyph(b, t.cmap, 0x20), 1, "space still mapped");
  assertEqual(cmapGlyph(b, t.cmap, 0x41), null, "everything else unmapped");
  assertEqual(t16s(b, t.head.off + 36), 0, "xMin fallback");
  assertEqual(t16s(b, t.head.off + 40), 512, "xMax fallback = cell width");
  assertEqual(t16s(b, t.head.off + 38), -192, "yMin fallback");
  assertEqual(t16s(b, t.head.off + 42), 832, "yMax fallback");
});

test("ttf: width guard — refuse cells too wide for 16-bit advances", function () {
  assertThrows(function () { TTF.build(BF.makeFont(64, 1), "bf-wide"); }, "64px @ 1px tall");
  assertThrows(function () { TTF.build(BF.makeFont(1024, 16), "bf-wide"); }, "1024px");
  // 40px wide @ 16px tall is 2560 units — fine.
  TTF.build(BF.makeFont(40, 16), "bf-ok");
});

test("ttf: invalid dims throw; null font throws", function () {
  assertThrows(function () { TTF.build({ width: 0, height: 16 }, "x"); }, "width 0");
  assertThrows(function () { TTF.build(null, "x"); }, "null font");
});

test("ttf: base64 — roundtrips the built bytes", function () {
  var f = sampleFont(), raw = TTF.build(f, "bf-test");
  var s = TTF.base64(raw);
  assertEqual(b64decode(s).length, raw.length, "decoded length");
  for (var i = 0; i < raw.length; i++) assertEqual(b64decode(s)[i], raw[i], "byte " + i);
  // Degenerate lengths (1 and 2 trailing bytes) must also roundtrip.
  var a = new Uint8Array([1]), c = new Uint8Array([1, 2]);
  assertEqual(Array.prototype.join.call(b64decode(TTF.base64(a))), "1", "1-byte pad ==");
  assertEqual(Array.prototype.join.call(b64decode(TTF.base64(c))), "1,2", "2-byte pad =");
});

test("ttf: buildFontFace — embeddable @font-face CSS", function () {
  var f = sampleFont();
  var css = TTF.buildFontFace(f, "bf-dogfood");
  assert(css.indexOf("@font-face {") === 0, "starts with @font-face");
  assert(css.indexOf('font-family: "bf-dogfood"') >= 0, "family present");
  var m = css.match(/data:font\/ttf;base64,([A-Za-z0-9+/=]+)/);
  assert(m, "data URI present");
  var dec = b64decode(m[1]), raw = TTF.build(f, "bf-dogfood");
  assertEqual(dec.length, raw.length, "payload decodes to full font");
  for (var i = 0; i < raw.length; i++) assertEqual(dec[i], raw[i], "payload byte " + i);
  // Hostile family input must not break out of the CSS string.
  var css2 = TTF.buildFontFace(f, 'a"b');
  assert(css2.indexOf('font-family: "ab"') >= 0, "quotes stripped from family");
});
