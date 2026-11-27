/*
 * bitforge — ttf.js
 * Pure logic, NO DOM. Builds a minimal, valid TrueType font (TTF) from a
 * bitforge font model (the BF.makeFont shape). Runs both in the browser
 * (exposes global `BF_TTF`) and under jsc (headless tests). Keep DOM-free.
 *
 * What it emits (DECISIONS #82 — dogfooding + Export TTF):
 *   - one face; compact glyph space: slot 0 = .notdef (empty), slots 1..M =
 *     the M *mapped* codes in ascending order. Mapped = codes with ink,
 *     plus 0x20 (space keeps its advance width even though it's blank).
 *     BLANK codes are left UNMAPPED in the cmap on purpose: the browser
 *     then falls back to the next font per-codepoint (the dogfooding safety
 *     rule). Other export formats (PNG/BDF/Verilog) still contain blanks.
 *   - every ink pixel is a 1×1 square; consecutive ink runs in one row are
 *     merged into one rectangle contour (4 on-curve points, clockwise in
 *     the TrueType y-up coordinate system).
 *   - cmap format 4, one subtable (Windows platform 3, encoding 1):
 *     mapped code runs as identity segments; blank runs inside 0..255 as
 *     explicit "map to glyph 0" segments (the spec's way of saying
 *     "unmapped"); codes 256..0xFFFF are covered by no segment at all.
 *   - name table carries the face name (the `family` argument).
 *   - conservative on purpose: no hinting, no layout tables, integer
 *     metrics, NO timestamps — same font in ⇒ same bytes out (testable).
 */
(function (root) {
  "use strict";

  var NUM_CODES = 256;

  /* ---------- tiny big-endian binary writer ---------- */
  function Writer() { this.b = []; }
  Writer.prototype.u8 = function (v) { this.b.push(v & 0xff); };
  Writer.prototype.u16 = function (v) { v = (v + 0x10000) % 0x10000; this.b.push((v >>> 8) & 0xff, v & 0xff); };
  Writer.prototype.i16 = function (v) { this.u16(v < 0 ? v + 0x10000 : v); };
  Writer.prototype.u32 = function (v) { v = v >>> 0; this.b.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); };
  Writer.prototype.length = function () { return this.b.length; };
  Writer.prototype.array = function () { return new Uint8Array(this.b); };
  Writer.prototype.pad4 = function () { while (this.b.length % 4) this.b.push(0); };
  Writer.prototype.bytes = function (src) {
    for (var i = 0; i < src.length; i++) this.b.push(src[i] & 0xff);
    return this;
  };

  function checksum4(bytes) {
    var sum = 0, i, w;
    // Spec: complete 4-byte words ONLY — a trailing 1-3 bytes are ignored.
    // (i + 3 < length, not i < length: a partial tail word is NOT a word.)
    for (i = 0; i + 3 < bytes.length; i += 4) {
      w = (((bytes[i] || 0) << 24) | ((bytes[i + 1] || 0) << 16) |
           ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0)) >>> 0;
      sum = (sum + w) >>> 0;
    }
    return sum;
  }

  /* ---------- metrics ---------- */
  // Units per pixel: pick K so unitsPerEm = height*K lands near 1024 while
  // staying an EXACT multiple of the glyph height (pixel→unit is exact).
  function upxOf(height) {
    var k = Math.round(1024 / height);
    return k < 1 ? 1 : k;
  }

  // The baseline grid line (between rows off-1 and off, 0-indexed from the
  // top): the font's own "base" horizontal guide when it has one, else the
  // app's baseline preset (height - 3), clamped to 1..height-1.
  function baselineOf(font) {
    var off = null, i;
    if (font.guidelines)
      for (i = 0; i < font.guidelines.length; i++) {
        var g = font.guidelines[i];
        if (g && g.o === "h" && g.label === "base") off = g.off;
      }
    if (off == null) off = font.height - 3;
    if (off < 1) off = 1;
    if (off > font.height - 1) off = font.height - 1;
    return off;
  }

  /* ---------- glyph space + cmap planning ---------- */
  // Which codes get a real glyph slot? Inked codes + 0x20, ascending.
  function mappedCodes(font) {
    var out = [], c;
    for (c = 0; c < NUM_CODES; c++)
      if (c === 0x20 || BF.inkCount(font, c) > 0) out.push(c);
    return out;
  }

  // Contours for one code: per row, each maximal run of ink pixels becomes
  // one rectangle. Points are clockwise in the y-up TTF system (filled).
  function glyphContours(font, code, upx, base) {
    var W = font.width, out = [], y;
    for (y = 0; y < font.height; y++) {
      var x = 0;
      while (x < W) {
        if (!BF.getPixel(font, code, x, y)) { x++; continue; }
        var x0 = x;
        while (x < W && BF.getPixel(font, code, x, y)) x++;
        var x1 = x; // exclusive
        out.push({
          x0: x0 * upx, x1: x1 * upx,
          yBot: (base - y - 1) * upx,
          yTop: (base - y) * upx
        });
      }
    }
    return out;
  }

  /* ---------- table builders ---------- */

  function buildGlyphs(font, codes, upx, base) {
    // Returns { glyf: Writer, loca: Writer, maxPoints, maxContours,
    // hmtx: Writer, xMin, yMin, xMax, yMax, minLsb }
    //
    // Glyph layout: slot 0 = .notdef, slots 1..M = the mapped codes (ascending).
    //   - Every EMPTY glyph (.notdef / blank code) is a ZERO-LENGTH glyph:
    //     loca[i] == loca[i+1]. This is the standard, unambiguous empty-glyph
    //     form (no 2-byte marker record, nothing for a reader to mis-read).
    //   - Every FILLED glyph: each maximal horizontal ink run in a row is one
    //     4-point rectangle. Points ordered clockwise in the TrueType y-up
    //     system: (x0,yBot) (x0,yTop) (x1,yTop) (x1,yBot).
    //
    // Coordinate encoding (OpenType glyf spec, per-point flag bits):
    //   0x01 on-curve | 0x02 x is a 1-BYTE (short) delta | 0x04 y is a 1-BYTE
    //   (short) delta | 0x08 repeat | 0x10 x same as previous (or: sign of a
    //   short x) | 0x20 y same as previous (or: sign of a short y)
    // A coordinate is a SIGNED 16-BIT DELTA only when its SHORT bit is CLEAR
    // and its SAME bit is CLEAR. So: every flag here is 0x01 (on-curve, both
    // deltas 16-bit) — matching the two-bytes-per-coordinate stream written
    // below (all x deltas first, then all y deltas; each relative to the
    // previous point, the first to the origin). (Regression [Z]: 0x10 was
    // 'x same as previous' — readers dropped every x; 0x07 set the SHORT
    // bits — readers consumed 1 byte per coordinate.)
    var glyf = new Writer();
    var locaOffsets = [0]; // locaOffsets[i] = start offset of glyph i
    var lsbs = [];         // left sidebearing per slot (one push per slot)
    var current = 0;
    var maxPts = 0, maxCont = 0;
    var fXMin = Infinity, fYMin = Infinity, fXMax = -Infinity, fYMax = -Infinity;
    var numGlyphs = codes.length + 1; // slot 0 = .notdef, then the mapped codes
    var i, slot;

    for (slot = 0; slot < numGlyphs; slot++) {
      var code = (slot === 0) ? -1 : codes[slot - 1];
      var cs = (slot === 0) ? [] : glyphContours(font, code, upx, base);
      if (!cs.length) { // empty glyph → zero-length (loca[slot+1] = loca[slot])
        locaOffsets[slot + 1] = current;
        lsbs.push(0);
        continue;
      }
      var n = cs.length;
      if (n > maxCont) maxCont = n;
      if (4 * n > maxPts) maxPts = 4 * n;
      // bounding box of this glyph
      var gx = Infinity, gy = Infinity, gX = -Infinity, gY = -Infinity;
      for (i = 0; i < n; i++) {
        if (cs[i].x0 < gx) gx = cs[i].x0;
        if (cs[i].yBot < gy) gy = cs[i].yBot;
        if (cs[i].x1 > gX) gX = cs[i].x1;
        if (cs[i].yTop > gY) gY = cs[i].yTop;
      }
      if (gx < fXMin) fXMin = gx;
      if (gy < fYMin) fYMin = gy;
      if (gX > fXMax) fXMax = gX;
      if (gY > fYMax) fYMax = gY;

      // ordered point list: per rectangle (x0,yBot)(x0,yTop)(x1,yTop)(x1,yBot)
      var P = [];
      for (i = 0; i < n; i++) {
        P.push([cs[i].x0, cs[i].yBot]);
        P.push([cs[i].x0, cs[i].yTop]);
        P.push([cs[i].x1, cs[i].yTop]);
        P.push([cs[i].x1, cs[i].yBot]);
      }
      var np = P.length;

      glyf.i16(n); // numberOfContours (>0)
      glyf.i16(gx); glyf.i16(gy); glyf.i16(gX); glyf.i16(gY); // bbox
      var end = 3;
      for (i = 0; i < n; i++) { glyf.u16(end); end += 4; } // endPts, 4 pts each
      glyf.u16(0); // instructionLength
      for (i = 0; i < np; i++) glyf.u8(0x01); // flags: on-curve, 16-bit x & y deltas (SHORT bits clear)
      // x coordinates as signed 2-byte deltas from the previous point
      var prevx = 0;
      for (i = 0; i < np; i++) { glyf.i16(P[i][0] - prevx); prevx = P[i][0]; }
      // y coordinates as signed 2-byte deltas from the previous point
      var prevy = 0;
      for (i = 0; i < np; i++) { glyf.i16(P[i][1] - prevy); prevy = P[i][1]; }

      current = glyf.length();
      locaOffsets[slot + 1] = current;
      lsbs.push(gx); // left sidebearing = the glyph's min x (>= 0)
    }

    // locaOffsets now has numGlyphs+1 entries (0..numGlyphs); last = total size.
    // SHORT loca (head.indexToLocFormat=0) stores each offset in 16-bit WORDS,
    // i.e. byte_offset/2 — the reader multiplies by 2 (confirmed: fontTools
    // decompile does `2*l`, compile does `l//2`; Apple TRM "an offset of 100
    // represents 200 bytes"). LONG loca stores byte offsets directly. Every
    // glyph here is 12+22n bytes (even), so every offset is even and /2 is exact.
    var short = glyf.length() <= 0xffff;
    var loca = new Writer();
    for (slot = 0; slot <= numGlyphs; slot++) {
      var off = locaOffsets[slot];
      if (short) loca.u16(off / 2); else loca.u32(off);
    }

    var hmtx = new Writer();
    var adv = font.width * upx;
    for (slot = 0; slot < numGlyphs; slot++) {
      hmtx.u16(adv); hmtx.i16(lsbs[slot]); // lsb = the glyph's xMin (0 if empty)
    }
    var minLsb = 0;
    for (i = 0; i < lsbs.length; i++) if (lsbs[i] < minLsb) minLsb = lsbs[i];
    return { glyf: glyf, loca: loca, hmtx: hmtx, maxPoints: maxPts,
             maxContours: maxCont, xMin: fXMin, yMin: fYMin, xMax: fXMax, yMax: fYMax,
             minLsb: minLsb };
  }

  // cmap format 4, single (3,1) subtable. `codes` = mapped codes ascending;
  // slot of code c = its index in `codes` + 1 (slot 0 = .notdef).
  //
  // Every MAPPED segment carries EXPLICIT per-code glyph entries (idRangeOffset
  // pointing at the entry pool): an identity-delta trick would only be valid
  // for a mapped run starting at code 0, and the mapped set here is an
  // arbitrary subset (inked codes + 0x20), so per-code entries are the
  // generally-correct form. BLANK codes sit in NO segment at all — a
  // renderer's "unmapped", which is what triggers per-codepoint font
  // fallback (the dogfooding safety rule). Codes 256..0xFFFF fall in NO
  // segment — also unmapped. (idRangeOffset = 0 is the spec's "use idDelta"
  // sentinel, so the entry pool always lives at a positive even offset from
  // the start of the idRangeOffset field.)
  function buildCmap(codes) {
    // Dense 256-slot table (sparse `slot[c] === undefined` would break the
    // `=== 0` blank test below and hang the segment scan — regression [Z]).
    var slot = [], i;
    for (i = 0; i < NUM_CODES; i++) slot[i] = 0;
    for (i = 0; i < codes.length; i++) slot[codes[i]] = i + 1;

    // Segments ONLY for the mapped (inked + space) runs — maximal runs.
    // Blank codes are left in NO segment ⇒ UNMAPPED, so a renderer falls back
    // to the next font per-codepoint (the dogfooding safety rule: a char left
    // blank in the font being edited still shows via the fallback font).
    // (The old approach mapped blanks to glyph 0 via explicit entries, which
    // renders an empty notdef instead of triggering fallback.)
    var segs = []; // { start, end, delta, entries: [glyph per code] }
    var c = 0;
    while (c < NUM_CODES) {
      if (slot[c] === 0) { c++; continue; } // blank → leave unmapped
      var s = c, entries = [];
      while (c < NUM_CODES && slot[c] > 0) { entries.push(slot[c]); c++; }
      segs.push({ start: s, end: c - 1, delta: 0, entries: entries });
    }
    // Spec: the LAST segment's start AND end MUST be 0xFFFF (Chromium's OTS:
    // "cmap: Final segment start and end must be 0xFFFF"). The standard
    // terminator: [0xFFFF,0xFFFF] with idDelta=1 → glyph 0 (.notdef) for
    // 0xFFFF; codes 0x100..0xFFFE sit in NO segment ⇒ unmapped ⇒ fallback.
    // (The old [0x100..0xFFFF] delta segment behaved the same for renderers
    // but fails OTS's parse.)
    segs.push({ start: 0xffff, end: 0xffff, delta: 1, entries: [] });
    var segCount = segs.length;
    var power = 1, entrySelector = 0;
    while (power * 2 <= segCount) { power *= 2; entrySelector++; }
    var searchRange = power * 2;

    var totalEntries = 0;
    for (s2 = 0; s2 < segCount; s2++) totalEntries += segs[s2].entries.length;
    var st = new Writer();
    // format(2) length(2) language(2) segCountX2(2) searchRange(2) entrySelector(2) rangeShift(2)
    st.u16(4); st.u16(16 + 8 * segCount + 2 * totalEntries); st.u16(0);
    st.u16(segCount * 2);
    st.u16(searchRange); st.u16(entrySelector);
    st.u16(segCount * 2 - searchRange);
    var s2;
    for (s2 = 0; s2 < segCount; s2++) st.u16(segs[s2].end);
    st.u16(0); // reservedPad
    for (s2 = 0; s2 < segCount; s2++) st.u16(segs[s2].start);
    for (s2 = 0; s2 < segCount; s2++) st.u16(segs[s2].delta); // idDelta
    var prev = 0;
    for (s2 = 0; s2 < segCount; s2++) {
      // Spec: idRangeOffset is measured from the START OF THIS SEGMENT'S OWN
      // idRangeOffset field (not the array's). The pool follows the whole
      // array, so: (arrayStart + 2*segCount) - (arrayStart + 2*s) + 2*prev.
      // idRangeOffset = 0 is the "use idDelta" sentinel — required for the
      // final [0x100..0xFFFF] delta segment (it has no entries).
      st.u16(segs[s2].entries.length ? 2 * (segCount - s2) + prev * 2 : 0);
      prev += segs[s2].entries.length;
    }
    for (s2 = 0; s2 < segCount; s2++)
      for (i = 0; i < segs[s2].entries.length; i++) st.u16(segs[s2].entries[i]);

    var arr = new Writer();
    arr.u16(0); arr.u16(1); // version 0, numTables 1
    arr.u16(3); arr.u16(1); // platform 3 (Windows), encoding 1 (Unicode)
    arr.u32(12);            // subtable offset: version(2)+numTables(2)+plat(2)+enc(2)+off(4)
    arr.bytes(st.array());
    return arr.array();
  }

  function nameString(s) {
    // UTF-16BE bytes.
    var out = [], i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s.charCodeAt(i);
      out.push((ch >> 8) & 0xff, ch & 0xff);
    }
    return out;
  }

  function buildName(family) {
    var ps = String(family).replace(/[^A-Za-z0-9_-]/g, "") || "Bitforge";
    var records = [
      [1, family],
      [2, "Regular"],
      [3, family + " Regular;1.0"],
      [4, family + " Regular"],
      [5, "Version 1.0"],
      [6, ps]
    ];
    var strings = [], i;
    for (i = 0; i < records.length; i++) strings.push(nameString(records[i][1]));
    // Name header is EXACTLY: format(2)=0, numStrings(2), stringOffset(2),
    // then the 12-byte records. (Confirmed against Geneva/Monaco/Symbol:
    // stringOffset == 6 + numStrings*12.) Records start at byte 6.
    var stringOffset = 6 + records.length * 12;
    var n = new Writer();
    n.u16(0);              // format (always 0)
    n.u16(records.length); // numStrings
    n.u16(stringOffset);   // relative to the START OF THE NAME TABLE
    var roff = 0;
    for (i = 0; i < records.length; i++) {
      // Record field order per spec: platform, encoding, language, nameID,
      // LENGTH, offset. The offset is RELATIVE TO THE STRING POOL
      // (data[stringOffset:]), cumulative — confirmed against Monaco/Geneva
      // and fontTools (which indexes the pool with it directly).
      n.u16(3); n.u16(1); n.u16(0x0409); n.u16(records[i][0]);
      n.u16(strings[i].length); n.u16(roff);
      roff += strings[i].length;
    }
    for (i = 0; i < strings.length; i++) n.bytes(strings[i]);
    return n.array();
  }

  function buildHead(font, upx, base, numGlyphs, longLoca, xMin, yMin, xMax, yMax) {
    // head v1.0 is EXACTLY 54 bytes (spec; verified against a known-good
    // system font: head len = 54). Layout, with offsets:
    //   0  version(4)          4  fontRevision(4)
    //   8  checkSumAdjustment(4)  12 magic(4)
    //  16  flags(2)           18  unitsPerEm(2)
    //  20  created(8, LongDateTime)  28 modified(8, LongDateTime)
    //  36  xMin(2) yMin(2) xMax(2) yMax(2)   — font bounding box
    //  44  macStyle(2)        46  lowestRecPPEM(2)
    //  48  fontDirectionHint(2)  50 indexToLocFormat(2)
    //  52  glyphDataFormat(2)
    // NOTE: head has NO "win bounding box" — win ascent/descent live in OS/2.
    // created/modified are 8-byte LongDateTimes each (deterministic: 0).
    var h = new Writer();
    h.u32(0x00010000); // version 1.0
    h.u32(0x00010000); // fontRevision 1.0
    h.u32(0);          // checkSumAdjustment — patched in build()
    h.u32(0x5f0f3cf5); // magic
    h.u16(xMin === 0 ? 0x0003 : 0x0001); // flags: bit0 macStyle-ok (0==0); bit1 (all LSBs at x=0) ONLY when the font bbox actually starts at x=0
    h.u16(font.height * upx); // unitsPerEm
    h.u32(0); h.u32(0);       // created (8-byte LongDateTime, deterministic: 0)
    h.u32(0); h.u32(0);       // modified (8-byte LongDateTime)
    h.i16(xMin); h.i16(yMin); h.i16(xMax); h.i16(yMax); // font bounding box
    h.u16(0);  // macStyle
    h.u16(8);  // lowestRecPPEM
    h.i16(2);  // fontDirectionHint: 2 = mixed
    h.i16(longLoca ? 1 : 0); // indexToLocFormat
    h.i16(0);  // glyphDataFormat
    return h.array();
  }

  function buildHhea(font, upx, base, numGlyphs, minLsb, xMax) {
    // hhea v1.0 is EXACTLY 36 bytes — canonical layout per the OpenType spec,
    // verified field-by-field against fontTools' hheaFormat (the oracle; the
    // previous "18 FWORDs" layout does not exist in the spec — hhea has no
    // unitsPerEm / font bbox / macStyle, those live in head — and readers of
    // the real layout read ascent=1024/descent=512 out of our upem/avg bytes,
    // producing 1.5em line boxes and a misplaced baseline):
    //   0  tableVersion(4) = 0x00010000 — 4-byte fixed 1.0, NOT two FWORDs
    //   4  ascent(2)  6  descent(2)  8  lineGap(2)
    //  10  advanceWidthMax(2)
    //  12  minLeftSideBearing(2)  14  minRightSideBearing(2)  16  xMaxExtent(2)
    //  18  caretSlopeRise(2)  20  caretSlopeRun(2)  22  caretOffset(2)
    //  24  reserved0..reserved3 (4 × 2 bytes)
    //  32  metricDataFormat(2)  34  numberOfHMetrics(2)
    // ascent/descent exactly bound all possible ink: row 0 maps to
    // y = base*upx (top of the font box), row height-1 to y = (base-height)*upx.
    // caretSlopeRise MUST be nonzero (1) — 0 made fontTools' decompile fail.
    var asc = base * upx;
    var desc = -(font.height - base) * upx;
    var adv = font.width * upx;
    var h = new Writer();
    h.u32(0x00010000); // tableVersion 1.0
    h.i16(asc);        // ascent
    h.i16(desc);       // descent (negative FWORD)
    h.i16(0);          // lineGap
    h.u16(adv);        // advanceWidthMax
    h.i16(minLsb);     // minLeftSideBearing
    h.i16(adv - xMax); // minRightSideBearing
    h.i16(xMax);       // xMaxExtent
    h.i16(1);          // caretSlopeRise
    h.i16(0);          // caretSlopeRun
    h.i16(0);          // caretOffset
    h.u16(0); h.u16(0); h.u16(0); h.u16(0); // reserved0..reserved3
    h.u16(0);          // metricDataFormat
    h.u16(numGlyphs);  // numberOfHMetrics
    return h.array();
  }

  function buildMaxp(numGlyphs, maxPoints, maxContours) {
    var m = new Writer();
    // TrueType fonts REQUIRE maxp v1.0 (0x00010000). v0.5 is for CFF fonts
    // — strict readers (CoreText) reject the combination.
    m.u32(0x00010000);
    m.u16(numGlyphs);
    m.u16(maxPoints); m.u16(maxContours);
    m.u16(0); m.u16(0); // composite points / contours
    m.u16(2);           // maxZones
    m.u16(0); m.u16(0); // twilight points / contours
    m.u16(0);           // maxProgramSize
    m.u16(0); m.u16(0); // maxStackDepth, maxInstructions
    m.u16(0); m.u16(0); // maxSizeOfInstructions, maxComponentElements
    m.u16(0);           // maxComponentDepth (maxp v1.0 is exactly 32 bytes)
    return m.array();
  }

  function buildOS2(font, upx, base) {
    var asc = base * upx, desc = -(font.height - base) * upx;
    // OS/2 v4 — EXACTLY 96 bytes in this order (OpenType spec; and the order
    // Chromium's OTS reads for EVERY version: it expects the subscript/
    // superscript/strikeout/familyClass fields right after fsType, so the
    // legacy 56-byte v0 layout — panose directly after fsType — fails OTS
    // with "OS/2: Error reading more basic table fields". CoreText accepts
    // the legacy layout, which is how that one shipped.)
    //   0  ulVersion(2)=4       2  xAvgCharWidth(2)
    //   4  usWeightClass(2)     6  usWidthClass(2)
    //   8  fsType(2)           10  ySubscript XSize/YSize/XOff/YOff (8)
    //  18  ySuperscript XSize/YSize/XOff/YOff (8)
    //  26  yStrikeoutSize(2)   28  yStrikeoutPosition(2)
    //  30  sFamilyClass(2)     32  panose (10)
    //  42  ulUnicodeRange1..4 (16)   58  achVendID (4)
    //  62  fsSelection(2)      64  usFirstCharIndex(2)
    //  66  usLastCharIndex(2)  68  sTypoAscender(2)
    //  70  sTypoDescender(2)   72  sTypoLineGap(2)
    //  74  usWinAscent(2)      76  usWinDescent(2)
    //  78  ulCodePageRange1(4) 82  ulCodePageRange2(4)
    //  86  sxHeight(2)         88  sCapHeight(2)
    //  90  usDefaultChar(2)    92  usBreakChar(2)
    //  94  usMaxContext(2)
    var o = new Writer();
    o.u16(4);            // ulVersion 4 (the spec's recommended floor)
    o.u16(font.width * upx); // xAvgCharWidth
    o.u16(400);          // usWeightClass
    o.u16(5);            // usWidthClass
    o.u16(0);            // fsType
    o.i16(0); o.i16(0); o.i16(0); o.i16(0); // ySubscript XSize/YSize/XOff/YOff
    o.i16(0); o.i16(0); o.i16(0); o.i16(0); // ySuperscript XSize/YSize/XOff/YOff
    o.i16(0); o.i16(0);  // yStrikeoutSize / yStrikeoutPosition
    o.i16(0);            // sFamilyClass
    var panose = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < 10; i++) o.u8(panose[i]); // panose (10 bytes)
    o.u32(0); o.u32(0); o.u32(0); o.u32(0); // ulUnicodeRange1..4
    o.u8(0x42); o.u8(0x46); o.u8(0x30); o.u8(0); // achVendID "BF0\0"
    o.u16(0x40);         // fsSelection bit 6 = REGULAR. (Bit 0 is ITALIC, not
                         //  roman — writing 1 here made OTS warn "Adjusting
                         // head.macStyle (italic) to match fsSelection".)
    o.u16(0);            // usFirstCharIndex
    o.u16(0xff);         // usLastCharIndex
    o.i16(asc); o.i16(desc); o.i16(0); // sTypoAscender/Descender/LineGap
    o.u16(asc); o.u16(-desc);          // usWinAscent / usWinDescent
    o.u32(1); o.u32(0);  // ulCodePageRange1 bit0 (Windows Latin1), Range2
    o.i16(0); o.i16(0);  // sxHeight / sCapHeight (untracked — 0 is valid)
    o.u16(0x20);         // usDefaultChar = space
    o.u16(0x20);         // usBreakChar = space (the spec's recommended value)
    o.u16(1);            // usMaxContext
    return o.array();
  }

  function buildPost(font, upx, base) {
    var desc = -(font.height - base) * upx;
    var em = font.height * upx;
    // post v3.0 is EXACTLY 32 bytes (OpenType spec, confirmed against the
    // normative table and the harfbuzz/freetype/oxideav layouts): the 16
    // common bytes, then four uint32 memory-limit fields, and NOTHING else.
    // "If the version is 1.0 or 3.0, the table ends here." — there is NO
    // numberOfGlyphs and NO glyphNameIndex in v3.0 (those are v1.0/2.0 only).
    //   version(4) italicAngle(4) underlinePosition(2) underlineThickness(2)
    //   isFixedPitch(4) minMemType42(4) maxMemType42(4) minMemType1(4) maxMemType1(4)
    // f2dot14 = fraction-of-em * 16384 (14 fixed bits), converted from units.
    var p = new Writer();
    p.u32(0x00030000); // version 3.0 (no glyph names)
    p.u32(0);          // italicAngle (upright)
    p.i16(Math.round((desc - upx) * 16384 / em)); // underlinePosition
    p.i16(Math.round(upx * 16384 / em));          // underlineThickness
    p.u32(1);          // isFixedPitch — it IS monospace
    p.u32(0); p.u32(0); // minMemType42, maxMemType42 (0 = unknown)
    p.u32(0); p.u32(0); // minMemType1,  maxMemType1  (0 = unknown)
    return p.array();
  }

  /* ---------- base64 (pure; jsc has no btoa) ---------- */
  var B64ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function base64(bytes) {
    var out = "", i, n, rem;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64ABC[(n >> 18) & 63] + B64ABC[(n >> 12) & 63] + B64ABC[(n >> 6) & 63] + B64ABC[n & 63];
    }
    rem = bytes.length - i;
    if (rem === 1) {
      n = bytes[i] << 16;
      out += B64ABC[(n >> 18) & 63] + B64ABC[(n >> 12) & 63] + "==";
    } else if (rem === 2) {
      n = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64ABC[(n >> 18) & 63] + B64ABC[(n >> 12) & 63] + B64ABC[(n >> 6) & 63] + "=";
    }
    return out;
  }

  /* ---------- assembly ---------- */
  function build(font, family) {
    var v = BF.validateDims(font.width, font.height);
    if (!v.ok) throw new Error("ttf: " + v.error);
    family = (typeof family === "string" && family.length) ? family.slice(0, 64) : "bitforge";

    var upx = upxOf(font.height);
    // hmtx advances are u16 and contour coordinates are i16 — refuse sizes
    // that can't fit instead of silently truncating (width*upx ≈ width*1024/height).
    if (font.width * upx > 0x7fff) throw new Error("ttf: glyph width too large for TTF (" + font.width + "px wide) — TTF advances/coords are 16-bit");
    var base = baselineOf(font);
    var codes = mappedCodes(font);
    var numGlyphs = codes.length + 1;

    var g = buildGlyphs(font, codes, upx, base);
    // loca holds numGlyphs + 1 offsets (one per glyph + the terminal one).
    var longLoca = g.loca.length() === (numGlyphs + 1) * 4;
    var xMin = g.xMin === Infinity ? 0 : g.xMin;
    var xMax = g.xMax === -Infinity ? font.width * upx : g.xMax;
    var yMin = g.yMin === Infinity ? -(font.height - base) * upx : g.yMin;
    var yMax = g.yMax === -Infinity ? base * upx : g.yMax;

    var tables = [
      ["cmap", buildCmap(codes)],
      ["glyf", g.glyf.array()],
      ["head", buildHead(font, upx, base, numGlyphs, longLoca, xMin, yMin, xMax, yMax)],
      ["hhea", buildHhea(font, upx, base, numGlyphs, g.minLsb, xMax)],
      ["hmtx", g.hmtx.array()],
      ["loca", g.loca.array()],
      ["maxp", buildMaxp(numGlyphs, g.maxPoints, g.maxContours)],
      ["name", buildName(family)],
      ["OS/2", buildOS2(font, upx, base)],
      ["post", buildPost(font, upx, base)]
    ];
    // The sfnt spec — and Chromium's OTS ("Table directory is not correctly
    // ordered") — require the table directory sorted by tag ascending; "OS/2"
    // (0x4F) sorts before "cmap" (0x63). CoreText doesn't enforce this.
    tables.sort(function (a, b2) { return a[0] < b2[0] ? -1 : a[0] > b2[0] ? 1 : 0; });

    var numTables = tables.length;
    var power = 1, entrySelector = 0;
    while (power * 2 <= numTables) { power *= 2; entrySelector++; }
    // Table-directory records are 16 bytes wide: searchRange = 16 x 2^es,
    // rangeShift = numTables*16 - searchRange. (The 2 x 2^es formula belongs
    // to the cmap format-4 header, whose entries are 2 bytes wide — copying
    // it here is exactly how the Windows/Chromium OTS failure shipped.)
    var searchRange = power * 16;

    var out = new Writer();
    out.u32(0x00010000); // sfnt version (TrueType)
    out.u16(numTables);
    out.u16(searchRange); out.u16(entrySelector);
    out.u16(numTables * 16 - searchRange);

    var offset = 12 + numTables * 16, i, t;
    var dirEntries = [];
    for (i = 0; i < tables.length; i++) {
      var bytes = tables[i][1];
      while (offset % 4) offset++;
      dirEntries.push({ tag: tables[i][0], offset: offset, length: bytes.length, bytes: bytes });
      offset += bytes.length;
    }
    for (i = 0; i < dirEntries.length; i++) {
      t = dirEntries[i];
      out.u8(t.tag.charCodeAt(0)); out.u8(t.tag.charCodeAt(1));
      out.u8(t.tag.charCodeAt(2)); out.u8(t.tag.charCodeAt(3));
      out.u32(checksum4(t.bytes));
      out.u32(t.offset); out.u32(t.length);
    }
    for (i = 0; i < dirEntries.length; i++) {
      t = dirEntries[i];
      out.pad4();
      out.bytes(t.bytes);
    }

    var arr = out.array();
    // Spec-correct checkSumAdjustment: the sum of the DIRECTORY table
    // checksums must equal 0xB1B0AFBA. Patching head's adjustment field
    // changes head's own checksum by exactly adj, so also keep head's
    // directory entry honest (strict readers compare it to the real table).
    var headIdx = -1;
    for (i = 0; i < tables.length; i++) if (tables[i][0] === "head") headIdx = i;
    var headEntry = dirEntries[headIdx];
    var sum = 0;
    for (i = 0; i < dirEntries.length; i++) sum = (sum + checksum4(dirEntries[i].bytes)) >>> 0;
    var adj = (0xB1B0AFBA - sum) >>> 0;
    var p = headEntry.offset + 8; // checkSumAdjustment is the 3rd u32 in head
    arr[p] = (adj >>> 24) & 0xff; arr[p + 1] = (adj >>> 16) & 0xff;
    arr[p + 2] = (adj >>> 8) & 0xff; arr[p + 3] = adj & 0xff;
    var d = 12 + headIdx * 16 + 4; // checksum field of head's directory entry
    var hchk = (checksum4(headEntry.bytes) + adj) >>> 0;
    arr[d] = (hchk >>> 24) & 0xff; arr[d + 1] = (hchk >>> 16) & 0xff;
    arr[d + 2] = (hchk >>> 8) & 0xff; arr[d + 3] = hchk & 0xff;
    return arr;
  }

  // Full @font-face CSS with the font embedded as a base64 data URI.
  function buildFontFace(font, family) {
    family = (typeof family === "string" && family.length)
      ? family.replace(/["\\]/g, "") : "";
    if (!family) family = "bf-dogfood";
    var b = build(font, family);
    return '@font-face { font-family: "' + family + '";' +
      ' src: url(data:font/ttf;base64,' + base64(b) + ') format("truetype"); }';
  }

  var api = {
    NUM_CODES: NUM_CODES,
    build: build,
    buildFontFace: buildFontFace,
    base64: base64,
    upxOf: upxOf,
    baselineOf: baselineOf,
    mappedCodes: mappedCodes,
    checksum4: checksum4
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    (root || (root = {})).BF_TTF = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this));
