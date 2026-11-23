/*
 * bitforge — core.js
 * Pure logic, NO DOM / NO canvas. Runs both in the browser (exposes global `BF`)
 * and in jsc (used by the unit tests). Keep this file DOM-free so it stays testable.
 *
 * Sections (grow as modules are added):
 *   [1] Font model  (done)
 *   [2] Verilog export   (done)
 *   [3] Preview markup parser (done)
 *   [4] Slant offsets (done)
 *   [5] Ink / luminance test for PNG import (done)
 *   [6] Atlas navigation (done)
 *   [7] Glyph shift (done)
 *   [8] Glyph status + QA checks (done)
 *   [9] BDF import / export (done)
 *   [10] Edge-ink QA (done)
 *   [11] Guideline-violation QA (done)
 */
(function (root) {
  "use strict";

  var NUM_GLYPHS = 256;
  var MAX_DIM = 1024; // hard cap (expected range ~1..64); keeps Uint8Array sane

  /* App version (DECISIONS #56). 0.MINOR.PATCH: MINOR = the chunk's position
   * (1-indexed) in the STATUS.md "Current state" list; PATCH = 0 for a single
   * chunk, the sub-index for a wave (chunk L.3 shipped 0.12.3). Bump in the
   * same commit as the chunk — a headless test pins the exact value. */
  var VERSION = "0.23.0";

  /* ============================================================
   * [1] Font model
   * ============================================================ */

  function isDim(n) {
    return typeof n === "number" && isFinite(n) && Math.floor(n) === n && n >= 1 && n <= MAX_DIM;
  }

  function validateDims(width, height) {
    if (!isDim(width))  return { ok: false, error: "width must be an integer 1.." + MAX_DIM + " (got " + width + ")" };
    if (!isDim(height)) return { ok: false, error: "height must be an integer 1.." + MAX_DIM + " (got " + height + ")" };
    return { ok: true };
  }

  // Create a blank (all-transparent) font of the given size. Throws on bad dims.
  function makeFont(width, height) {
    var v = validateDims(width, height);
    if (!v.ok) throw new Error(v.error);
    return {
      width: width,
      height: height,
      data: new Uint8Array(NUM_GLYPHS * height * width),
      name: "font", // face name (DECISIONS #70); exported in filenames + BDF header
      guidelines: [], // editor guides, per-font (shared across glyphs); NOT exported to ROM
      status: new Uint8Array(NUM_GLYPHS), // 0=unfinished 1=wip 2=done (DECISIONS #38); NOT exported
      silences: {} // silenced QA checks per glyph { checkId: { code: true } } (DECISIONS #59); NOT exported
    };
  }

  function inBounds(font, code, x, y) {
    return code >= 0 && code < NUM_GLYPHS &&
           x >= 0 && x < font.width &&
           y >= 0 && y < font.height;
  }

  function getPixel(font, code, x, y) {
    if (!inBounds(font, code, x, y)) return 0;
    return font.data[((code * font.height) + y) * font.width + x];
  }

  function setPixel(font, code, x, y, v) {
    if (!inBounds(font, code, x, y)) throw new Error("setPixel out of bounds: code=" + code + " x=" + x + " y=" + y);
    font.data[((code * font.height) + y) * font.width + x] = v ? 1 : 0;
  }

  function clearGlyph(font, code) {
    if (code < 0 || code >= NUM_GLYPHS) throw new Error("clearGlyph bad code " + code);
    var base = (code * font.height) * font.width;
    var count = font.height * font.width;
    for (var i = 0; i < count; i++) font.data[base + i] = 0;
  }

  // Numeric row bitmask. bit x = pixel at column x (x=0 is leftmost), so the
  // rightmost pixel is the MSB. Only valid for width <= 32 (32-bit ops).
  // For arbitrary width, use rowBitsString (the actual Verilog path).
  function rowBits(font, code, y) {
    if (code < 0 || code >= NUM_GLYPHS || y < 0 || y >= font.height) return 0;
    var base = ((code * font.height) + y) * font.width;
    var n = 0;
    for (var x = 0; x < font.width; x++) {
      if (font.data[base + x]) n |= (1 << x);
    }
    return n;
  }

  // Binary row string of exactly `width` chars, MSB (rightmost pixel) first,
  // i.e. the visual row written left-to-right is reversed. Works for any width.
  function rowBitsString(font, code, y) {
    if (code < 0 || code >= NUM_GLYPHS || y < 0 || y >= font.height) return "";
    var base = ((code * font.height) + y) * font.width;
    var s = "";
    for (var x = font.width - 1; x >= 0; x--) {
      s += font.data[base + x] ? "1" : "0";
    }
    return s;
  }

  /* ============================================================
   * [2] Verilog export  ($readmemb)
   * One line per glyph row; `width` bits per line; rightmost pixel = MSB
   * (visual row reversed); top->bottom; glyph 0 first; 256*height lines.
   * ============================================================ */

  // Full ROM text. Ends with a trailing newline.
  function toVerilog(font) {
    var lines = new Array(NUM_GLYPHS * font.height);
    var idx = 0;
    for (var code = 0; code < NUM_GLYPHS; code++) {
      for (var y = 0; y < font.height; y++) {
        lines[idx++] = rowBitsString(font, code, y);
      }
    }
    return lines.join("\n") + "\n";
  }

  /* ============================================================
   * [3] Preview markup parser
   * Parses preview text into per-glyph descriptors { code, bold, italic, ok }:
   *   code : 0..255, or -1 when not displayable
   *   ok   : false when the source char is outside the 8-bit atlas
   * Rules: `*` toggles bold, `_` toggles italic (nestable/combining);
   *        `\*` / `\_` -> literal * / _ (no toggle);
   *        `\\` -> literal backslash;
   *        `\uXX` (2 hex digits) -> codepoint 0xXX;
   *        unknown `\x` -> literal backslash, then x parsed normally.
   * ============================================================ */

  function isHex(ch) {
    if (ch == null) return false;
    return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
  }

  function parseMarkup(text) {
    var out = [];
    var bold = false;
    var italic = false;
    var i, c, cp, ok, n;
    for (i = 0; i < text.length; i++) {
      c = text.charAt(i);
      if (c === "*") { bold = !bold; continue; }
      if (c === "_") { italic = !italic; continue; }
      if (c === "\n") { out.push({ code: -1, bold: bold, italic: italic, ok: true, nl: true }); continue; } // break token (DECISIONS #63)
      if (c === "\\") {
        n = text.charAt(i + 1);
        if (n === "*" || n === "_") {           // escaped formatting char: literal, no toggle
          out.push({ code: (n === "*") ? 0x2A : 0x5F, bold: bold, italic: italic, ok: true });
          i += 1;
          continue;
        }
        if (n === "\\") {                        // escaped backslash
          out.push({ code: 0x5C, bold: bold, italic: italic, ok: true });
          i += 1;
          continue;
        }
        if (n === "u" && isHex(text.charAt(i + 2)) && isHex(text.charAt(i + 3))) {
          out.push({ code: parseInt(text.slice(i + 2, i + 4), 16), bold: bold, italic: italic, ok: true });
          i += 3;
          continue;
        }
        // Unknown escape: literal backslash; the next char is parsed normally.
        out.push({ code: 0x5C, bold: bold, italic: italic, ok: true });
        continue;
      }
      cp = text.charCodeAt(i);
      if (cp >= 0xD800 && cp <= 0xDBFF &&
          text.charCodeAt(i + 1) >= 0xDC00 && text.charCodeAt(i + 1) <= 0xDFFF) {
        out.push({ code: -1, bold: bold, italic: italic, ok: false });
        i += 1;
        continue;
      }
      ok = cp <= 255;
      out.push({ code: ok ? cp : -1, bold: bold, italic: italic, ok: ok });
    }
    return out;
  }

  /* ============================================================
   * [4] Slant offsets  ("cheap slant" / italic)
   * Pure per-row horizontal offset. Contract (DECISIONS #11):
   *   - baseline row -> offset 0
   *   - rows above the baseline -> offset >= 0
   *   - rows below the baseline -> offset < 0
   * y=0 is the TOP row. `baselineFromBottom` is 0-based from the bottom (default 5).
   * `slope` = vertical px per 1 horizontal px (default 2 => 1px per 2 rows).
   * Positive = to the right, so the glyph leans like "/" (italic).
   * ============================================================ */

  function slantRowOffset(y, height, baselineFromBottom, slope) {
    var b = (baselineFromBottom == null) ? 5 : baselineFromBottom;
    var s = (slope == null) ? 2 : slope;
    var baseline = (height - 1) - b; // baseline row index, 0 = top
    return Math.floor((baseline - y) / s);
  }

  /* ============================================================
   * [5] Ink / luminance test  (PNG import classifier)
   * A pixel is "ink" if, after compositing over white, its luminance < 128.
   * One rule covers black-on-white, transparent backgrounds, and light
   * checkerboard cell borders (DECISIONS #7).
   * ============================================================ */

  // Standard luma of an opaque RGB triple (0..255 each), as an integer 0..255.
  // BT.601 fixed-point weights summing to 65536, so a gray of value v maps to
  // exactly v (avoids the float 127.999... that would flip the <128 threshold).
  function luminance(r, g, b) {
    return (r * 19595 + g * 38470 + b * 7471) >> 16;
  }

  // Is this RGBA pixel ink? `a` is 0..255; missing a => treated as opaque.
  function isInk(r, g, b, a) {
    var alpha = (a == null) ? 1 : a / 255;
    var l = luminance(r, g, b);
    var leff = l * alpha + 255 * (1 - alpha); // composite over white
    return leff < 128;
  }

  /* ============================================================
   * [6] Atlas navigation
   * The 256 glyphs form a 16x16 grid (row-major, 0x00 top-left).
   * dir: "left" | "right" | "up" | "down" | "rowStart" | "rowEnd"
   *      | "top" | "bottom"
   * Clamps at the edges (no wrap). rowStart/rowEnd = col 0/15 of the
   * CURRENT row (DECISIONS #32).
   * ============================================================ */

  function navigate(code, dir) {
    var c = code | 0;
    switch (dir) {
      case "left":     return c > 0 ? c - 1 : c;
      case "right":    return c < NUM_GLYPHS - 1 ? c + 1 : c;
      case "up":       return c >= 16 ? c - 16 : c;
      case "down":     return c <= NUM_GLYPHS - 17 ? c + 16 : c;
      case "rowStart": return c & ~15;          // col 0 of the current row
      case "rowEnd":   return (c & ~15) + 15;   // col 15 of the current row
      case "top":      return 0;
      case "bottom":   return NUM_GLYPHS - 1;
      default:         return c;
    }
  }

  /* ============================================================
   * [7] Glyph shift
   * Shift one glyph's ink by (dx, dy) pixels. Ink that would land outside
   * the cell is dropped. Mutates font. Returns { clipped, changed }.
   * (DECISIONS #34: keyboard-only shift; clipped ink => app shows a toast.)
   * ============================================================ */

  function shiftGlyph(font, code, dx, dy) {
    if (code < 0 || code >= NUM_GLYPHS) throw new Error("shiftGlyph bad code " + code);
    var w = font.width, h = font.height;
    var base = (code * h) * w;
    var tmp = new Uint8Array(w * h);
    var clipped = 0, changed = false, y, x, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (!font.data[base + y * w + x]) continue;
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) { clipped++; continue; }
        tmp[ny * w + nx] = 1;
      }
    }
    for (i = 0; i < w * h; i++) {
      if (font.data[base + i] !== tmp[i]) changed = true;
      font.data[base + i] = tmp[i];
    }
    return { clipped: clipped, changed: changed };
  }

  /* ============================================================
   * [8] Glyph status + QA checks
   * status: Uint8Array(256), 0=unfinished (default) 1=wip 2=done.
   * Persisted with the font, never exported (DECISIONS #38).
   * ============================================================ */

  function inkCount(font, code) {
    if (code < 0 || code >= NUM_GLYPHS) return 0;
    var base = (code * font.height) * font.width, n = 0;
    for (var i = 0; i < font.width * font.height; i++) n += font.data[base + i];
    return n;
  }

  // Status tallies for all 256 codes and for the printable range 0x20..0x7E.
  // Returns { all: {unfinished, wip, done}, printable: {unfinished, wip, done} }.
  function statusCounts(font) {
    var all = { unfinished: 0, wip: 0, done: 0 };
    var printable = { unfinished: 0, wip: 0, done: 0 };
    var s = font.status;
    for (var code = 0; code < NUM_GLYPHS; code++) {
      var st = (s && s[code]) || 0;
      if (st === 2) all.done++; else if (st === 1) all.wip++; else all.unfinished++;
      if (code >= 0x20 && code <= 0x7e) {
        if (st === 2) printable.done++; else if (st === 1) printable.wip++; else printable.unfinished++;
      }
    }
    return { all: all, printable: printable };
  }

  // Groups of 2+ codepoints sharing an identical bitmap (DECISIONS #42).
  // The all-empty group is excluded (pre-drawing noise).
  // Returns [{ codes: [ints ascending], ink: int }] in first-code order.
  function findDuplicates(font) {
    var w = font.width, h = font.height;
    var map = {}, order = [];
    for (var code = 0; code < NUM_GLYPHS; code++) {
      var key = "";
      for (var y = 0; y < h; y++) key += rowBitsString(font, code, y);
      var g = map[key];
      if (!g) { g = map[key] = { key: key, codes: [] }; order.push(g); }
      g.codes.push(code);
    }
    var emptyKey = "";
    for (var i = 0; i < w * h; i++) emptyKey += "0";
    var out = [];
    for (var k = 0; k < order.length; k++) {
      var gg = order[k];
      if (gg.codes.length < 2 || gg.key === emptyKey) continue;
      out.push({ codes: gg.codes, ink: inkCount(font, gg.codes[0]) });
    }
    return out;
  }

  /* ============================================================
   * [9] BDF import / export  (DECISIONS #43)
   * Standard single-face BDF (the X11 bitmap-font text format).
   * Import: first face only; W = BW (or DW), H = DH (or DS); supports
   * ENCODING or CODES (multi-code), BBX placement, wrapped BITMAP hex.
   * BITMAP rows are padded on the right with zeros to the nearest BYTE
   * (2 hex digits per byte); the leftmost pixel is the MSB.
   * Export: one face, all 256 codes, hex BITMAP rows, leftmost pixel = MSB.
   * ============================================================ */

  function parseBDF(text) {
    var lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    // Pass 1: face dimensions, taken before the first glyph block.
    var firstChar = -1, w = 0, h = 0, t, tok;
    for (var i = 0; i < lines.length; i++) {
      t = lines[i].trim();
      if (t.indexOf("STARTCHAR") === 0) { firstChar = i; break; }
      if (!t) continue;
      tok = t.split(/\s+/);
      if ((tok[0] === "BW" || tok[0] === "DW") && !w) w = parseInt(tok[1], 10);
      if ((tok[0] === "DH" || tok[0] === "DS") && !h) h = parseInt(tok[1], 10);
    }
    if (firstChar < 0) throw new Error("BDF: no glyph blocks found");
    if (!isDim(w) || !isDim(h)) throw new Error("BDF: missing or bad face dimensions (BW/DH)");
    // Face name from the FONT line, when present (DECISIONS #70). "FONT "
    // (with the space) can't collide with FONTBOUNDBOX / ADD_FONT.
    var fname = null;
    for (var f = 0; f < firstChar; f++) {
      var fl = lines[f].trim();
      if (fl.indexOf("FONT ") === 0) {
        var q = fl.slice(5).match(/^"(.*)"$/);
        if (q) fname = q[1];
      }
    }
    var data = new Uint8Array(NUM_GLYPHS * h * w);
    // Pass 2: glyph blocks (first face only: stop at ENDFONT).
    var charCount = 0, bm = null;
    function finishChar() {
      if (!bm) return;
      if (!bm.bbx) throw new Error("BDF: character block missing BBX");
      if (!bm.codes || !bm.codes.length) throw new Error("BDF: character block missing CODES/ENCODING");
      if (bm.hex.length < bm.need) throw new Error("BDF: BITMAP data too short");
      // Rows are padded to whole BYTES on the low end; leftmost pixel = MSB,
      // so hex digits are read right-to-left.
      var hexPerRow = Math.ceil(bm.bbx.w / 8) * 2;
      var padBits = hexPerRow * 4 - bm.bbx.w;
      for (var ci = 0; ci < bm.codes.length; ci++) {
        var code = parseInt(bm.codes[ci], 10);
        if (isNaN(code) || code < 0 || code >= NUM_GLYPHS) continue; // 8-bit font: ignore the rest
        for (var r = 0; r < bm.bbx.h; r++) {
          for (var p = 0; p < bm.bbx.w; p++) {
            var bitPos = padBits + bm.bbx.w - 1 - p; // pixel p -> bit position
            var hd = parseInt(bm.hex.charAt(r * hexPerRow + (hexPerRow - 1 - (bitPos >> 2))), 16);
            if (isNaN(hd)) throw new Error("BDF: bad BITMAP hex");
            if (!((hd >> (bitPos & 3)) & 1)) continue;
            var cx = bm.bbx.xoff + p, cy = bm.bbx.yoff + r;
            if (cx >= 0 && cx < w && cy >= 0 && cy < h) data[(code * h + cy) * w + cx] = 1;
          }
        }
      }
      charCount++;
      bm = null;
    }
    for (var j = firstChar; j < lines.length; j++) {
      var line = lines[j].trim();
      if (!line || line.indexOf("COMMENT ") === 0) continue;
      if (line === "ENDFONT") break;
      if (line === "ENDCHAR") { finishChar(); continue; }
      if (line.indexOf("STARTCHAR") === 0) {
        if (bm) throw new Error("BDF: STARTCHAR without ENDCHAR");
        bm = { codes: null, bbx: null, hex: "", need: 0, bitsMode: false };
        continue;
      }
      if (!bm) continue;
      var tk = line.split(/\s+/);
      var kw = tk[0];
      if (kw === "CODES") bm.codes = tk.slice(1);
      else if (kw === "ENCODING") bm.codes = [tk[1]];
      else if (kw === "BBX") {
        bm.bbx = { w: parseInt(tk[1], 10), h: parseInt(tk[2], 10), xoff: parseInt(tk[3] || "0", 10), yoff: parseInt(tk[4] || "0", 10) };
        if (!(bm.bbx.w > 0) || !(bm.bbx.h > 0) || isNaN(bm.bbx.xoff) || isNaN(bm.bbx.yoff)) throw new Error("BDF: bad BBX");
        bm.need = Math.ceil(bm.bbx.w / 8) * 2 * bm.bbx.h; // bytes per row -> hex digits
      }
      else if (kw === "BITMAP") { bm.bitsMode = true; bm.hex += line.slice(6).replace(/\s+/g, ""); }
      else if (bm.bitsMode && bm.hex.length < bm.need) bm.hex += line.replace(/\s+/g, "");
    }
    finishChar(); // tolerate an unterminated last block
    if (charCount === 0) throw new Error("BDF: no usable glyphs");
    return { width: w, height: h, data: data, name: fname };
  }

  function toBDF(font) {
    var w = font.width, h = font.height, L = [];
    // The face name goes in the BDF header (DECISIONS #70). BDF strings are
    // double-quoted, so any quote in the name is dropped for the label.
    var nm = sanitizeFontName(font.name).replace(/"/g, "");
    var label = nm || "bitforge";
    L.push("STARTFONT 2.1");
    L.push("COMMENT Generated by bitforge");
    L.push("FONT \"" + label + "\"");
    L.push("FAMILY \"" + label + "\"");
    L.push("WEIGHT Medium");
    L.push("SLANT R");
    L.push("SETWIDTH " + w + " " + h);
    L.push("ADD_FONT us");
    L.push("SIZE " + h);
    L.push("FONTBOUNDBOX " + w + " " + h + " 0 0");
    L.push("STARTPROPERTIES 2");
    L.push("UNDERSCORE_POSITION 0");
    L.push("UNDERSCORE_THICKNESS 1");
    L.push("ENDPROPERTIES");
    L.push("CHARS 256");
    L.push("SIZE " + h);
    L.push("BW " + w);
    L.push("DW " + w);
    L.push("DH " + h);
    L.push("DS " + h);
    L.push("CHARWD 256 ( " + w + " " + h + " " + w + " " + h + " )");
    for (var code = 0; code < NUM_GLYPHS; code++) {
      L.push("STARTCHAR cp" + code);
      L.push("ENCODING " + code);
      L.push("SWIDTH 0 0");
      L.push("ADVW " + w);
      L.push("BBX " + w + " " + h + " 0 0");
      L.push("DWIDTH " + w + " " + h);
      L.push("BITMAP");
      for (var y = 0; y < h; y++) {
        var bits = "";
        for (var x = 0; x < w; x++) bits += font.data[((code * h) + y) * w + x] ? "1" : "0";
        while (bits.length % 8) bits += "0"; // pad to a whole byte (BDF convention)
        var hex = "";
        for (var b = 0; b < bits.length; b += 4) hex += parseInt(bits.substring(b, b + 4), 2).toString(16);
        L.push(hex);
      }
      L.push("ENDCHAR");
    }
    L.push("ENDFONT");
    return L.join("\n") + "\n";
  }

  /* ============================================================
   * [10] Edge-ink QA (DECISIONS #46 — QA edge-ink lint)
   * ============================================================ */

  // Which cell edges does the glyph's ink touch? Returns a subset of
  // ["top","bottom","left","right"] in that order (top = row 0, bottom =
  // row H-1, left = col 0, right = col W-1). Empty for a blank glyph.
  // On a 1px-wide/tall font a single ink pixel can touch all four edges.
  function edgeInk(font, code) {
    if (code < 0 || code >= NUM_GLYPHS) return [];
    var w = font.width, h = font.height;
    var base = code * h * w;
    var top = false, bottom = false, left = false, right = false;
    for (var y = 0; y < h; y++) {
      var row = base + y * w;
      for (var x = 0; x < w; x++) {
        if (!font.data[row + x]) continue;
        if (y === 0) top = true;
        if (y === h - 1) bottom = true;
        if (x === 0) left = true;
        if (x === w - 1) right = true;
      }
    }
    var edges = [];
    if (top) edges.push("top");
    if (bottom) edges.push("bottom");
    if (left) edges.push("left");
    if (right) edges.push("right");
    return edges;
  }

  /* ============================================================
   * [11] Guideline-violation QA (DECISIONS #47 — label-aware bounds)
   * ============================================================ */

  // The ONLY guide labels that act as bounds (user decision: label-aware,
  // not a min/max bounding box — cap/x/base/free guides are reference-only,
  // and a lone baseline guide must not collapse a box to a line). These
  // values are the single source of truth: the app's guideline presets
  // (GUIDE_PRESETS in app.js) use them too. Labels match the chip names
  // the user sees, so QA details can reference the guide by name.
  var GUIDE_BOUND_LABELS = { top: "asc", bottom: "desc", left: "L", right: "R" };

  // Which guides form the bounds of the cell? Returns
  // { top, bottom, left, right } where each is { off, label } or null:
  //   top    = topmost (smallest off) guide labelled GUIDE_BOUND_LABELS.top
  //   bottom = lowest    (largest off)  guide labelled GUIDE_BOUND_LABELS.bottom
  //   left   = leftmost  (smallest off) guide labelled GUIDE_BOUND_LABELS.left
  //   right  = rightmost (largest off)  guide labelled GUIDE_BOUND_LABELS.right
  // A font without the preset guide on a side has no bound on that side.
  function guideBounds(font) {
    var top = null, bottom = null, left = null, right = null, g;
    for (var i = 0; i < font.guidelines.length; i++) {
      g = font.guidelines[i];
      if (g.o === "h" && g.label === GUIDE_BOUND_LABELS.top && (top === null || g.off < top.off)) top = { off: g.off, label: g.label };
      if (g.o === "h" && g.label === GUIDE_BOUND_LABELS.bottom && (bottom === null || g.off > bottom.off)) bottom = { off: g.off, label: g.label };
      if (g.o === "v" && g.label === GUIDE_BOUND_LABELS.left && (left === null || g.off < left.off)) left = { off: g.off, label: g.label };
      if (g.o === "v" && g.label === GUIDE_BOUND_LABELS.right && (right === null || g.off > right.off)) right = { off: g.off, label: g.label };
    }
    return { top: top, bottom: bottom, left: left, right: right };
  }

  // Which bounds does the glyph's ink cross? Returns [{ bound, label, over }]
  // where bound is "top"|"bottom"|"left"|"right", label is the guide's name
  // (for the detail text) and over is the overshoot in px (>= 1). Ink sitting
  // exactly ON a bound line is fine; blank glyphs and fonts without the
  // relevant bound produce nothing.
  function guideViolations(font, code) {
    if (code < 0 || code >= NUM_GLYPHS) return [];
    var w = font.width, h = font.height, base = code * h * w;
    var minR = h, maxR = -1, minC = w, maxC = -1;
    for (var y = 0; y < h; y++) {
      var row = base + y * w;
      for (var x = 0; x < w; x++) {
        if (!font.data[row + x]) continue;
        if (y < minR) minR = y;
        if (y > maxR) maxR = y;
        if (x < minC) minC = x;
        if (x > maxC) maxC = x;
      }
    }
    if (maxR < 0) return []; // blank glyph
    // Guides are drawn on grid boundaries — BETWEEN pixels (DECISIONS #65): a
    // guide at offset `off` sits between indices off-1 and off, never on a
    // pixel. "Outside" is therefore: above/left of a top/left line = index <
    // off; below/right of a bottom/right line = index >= off (the pixel at off
    // is the FIRST one past the line). `over` counts pixel rows/cols outside.
    var b = guideBounds(font), out = [];
    if (b.top && minR < b.top.off) out.push({ bound: "top", label: b.top.label, over: b.top.off - minR });
    if (b.bottom && maxR >= b.bottom.off) out.push({ bound: "bottom", label: b.bottom.label, over: maxR - b.bottom.off + 1 });
    if (b.left && minC < b.left.off) out.push({ bound: "left", label: b.left.label, over: b.left.off - minC });
    if (b.right && maxC >= b.right.off) out.push({ bound: "right", label: b.right.label, over: maxC - b.right.off + 1 });
    return out;
  }

  /* ============================================================
   * [12] Project file (.bitforge)  (DECISIONS #64)
   * WIP snapshot: the font blob (same shape as the localStorage blob) plus
   * optional settings. Pure data in/out — the app handles file IO and UI.
   * PNG remains the primary interchange format for finalized fonts; this
   * format is what carries guidelines / status / silences / preview text.
   * ============================================================ */

  var PROJECT_APP = "bitforge";
  var PROJECT_KIND = "font-project";
  var PROJECT_VERSION = 1;

  // Font name (DECISIONS #70): printable ASCII (0x20..0x7E) only, at most 64
  // chars, trimmed. Anything else is dropped; the result may be empty.
  function sanitizeFontName(s) {
    if (typeof s !== "string") return "";
    var out = "";
    for (var i = 0; i < s.length && out.length < 64; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0x20 && c <= 0x7e) out += s.charAt(i);
    }
    return out.replace(/^\s+/, "").replace(/\s+$/, "");
  }
  // Download-filename base for a font (empty name -> "font").
  function filenameBase(name) {
    return sanitizeFontName(name) || "font";
  }

  // Font -> blob { w, h, d, n, g, s, si } (the localStorage blob shape).
  function fontToBlob(font) {
    return {
      w: font.width, h: font.height,
      d: Array.prototype.slice.call(font.data),
      n: font.name,
      g: font.guidelines,
      s: Array.prototype.slice.call(font.status),
      si: font.silences
    };
  }

  // Blob -> Font, or null. Shared by localStorage restore and project import.
  // `knownCheckIds` (app-level list) bounds which QA silences survive.
  function fontFromBlob(o, knownCheckIds) {
    if (!o || typeof o !== "object") return null;
    if (!validateDims(o.w, o.h).ok) return null;
    var font = makeFont(o.w, o.h);
    var nm = sanitizeFontName(o.n); // missing/invalid -> keep the makeFont default
    if (nm) font.name = nm;
    var d = font.data;
    if (Array.isArray(o.d))
      for (var i = 0; i < d.length && i < o.d.length; i++) d[i] = o.d[i] ? 1 : 0;
    if (Array.isArray(o.g)) {
      font.guidelines = [];
      for (var k = 0; k < o.g.length; k++) {
        var e = o.g[k];
        if (e && (e.o === "h" || e.o === "v") && isFinite(e.off) && e.off === (e.off | 0))
          font.guidelines.push({ o: e.o, off: e.off, label: String(e.label != null ? e.label : e.o), color: String(e.color != null ? e.color : "#444444") });
      }
    }
    if (Array.isArray(o.s) && o.s.length === NUM_GLYPHS) {
      for (var m = 0; m < NUM_GLYPHS; m++) {
        var sv = o.s[m];
        font.status[m] = (sv === 1 || sv === 2) ? sv : 0;
      }
    }
    if (o.si && typeof o.si === "object" && Array.isArray(knownCheckIds)) {
      var known = {};
      for (var qi = 0; qi < knownCheckIds.length; qi++) known[knownCheckIds[qi]] = 1;
      for (var sid in o.si) {
        if (!known.hasOwnProperty(sid) || !o.si.hasOwnProperty(sid)) continue;
        var sm = {};
        for (var ckey in o.si[sid]) {
          var cv = +ckey;
          if (o.si[sid].hasOwnProperty(ckey) && isFinite(cv) && cv === (cv | 0) && cv >= 0 && cv < NUM_GLYPHS)
            sm[cv] = true;
        }
        font.silences[sid] = sm;
      }
    }
    return font;
  }

  // Font (+ optional settings object) -> project object (JSON-serializable).
  function projectToObj(font, settingsObj) {
    var o = { app: PROJECT_APP, kind: PROJECT_KIND, version: PROJECT_VERSION, font: fontToBlob(font) };
    if (settingsObj && typeof settingsObj === "object") o.settings = settingsObj;
    return o;
  }

  // Project object -> { ok: true, font, settings } | { ok: false, error }.
  // `settings` is null when the file has none (or has a malformed one).
  function objFromProject(o, knownCheckIds) {
    if (!o || typeof o !== "object") return { ok: false, error: "not a JSON object" };
    if (o.app !== PROJECT_APP || o.kind !== PROJECT_KIND)
      return { ok: false, error: "not a bitforge project file" };
    if (o.version !== PROJECT_VERSION)
      return { ok: false, error: "unsupported project version " + o.version + " (this build reads " + PROJECT_VERSION + ")" };
    var font = fontFromBlob(o.font, knownCheckIds);
    if (!font) return { ok: false, error: "invalid font data" };
    var settings = (o.settings && typeof o.settings === "object") ? o.settings : null;
    return { ok: true, font: font, settings: settings };
  }

  /* ============================================================
   * [13] Cell resize (DECISIONS #71)
   * ============================================================ */

  function clampInt(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }

  // Deep-copy a font (undo snapshots, resize). Pure.
  function cloneFont(font) {
    var out = makeFont(font.width, font.height);
    out.name = font.name;
    out.data.set(font.data);
    for (var i = 0; i < font.guidelines.length; i++) {
      var g = font.guidelines[i];
      out.guidelines.push({ o: g.o, off: g.off, label: g.label, color: g.color });
    }
    out.status.set(font.status);
    for (var sid in font.silences) {
      out.silences[sid] = {};
      for (var k in font.silences[sid]) out.silences[sid][k] = true;
    }
    return out;
  }

  // Resize the cell by adding/removing rows/cols at the chosen edges.
  // deltas: { dTop, dBottom, dLeft, dRight } — integers, positive = add at
  // that edge, negative = remove. Ink at (x, y) moves to (x + dLeft,
  // y + dTop): extending left/top pushes content down/right; extending
  // right/bottom leaves it in place. Guidelines shift with the content
  // (h: off += dTop, v: off += dLeft), clamped to [0, newDim]. Name,
  // status and silences survive (per-code, not per-pixel).
  // Returns { font, inkClipped, clippedCodes } — a NEW font object; the
  // input is untouched. clippedCodes = ascending list of glyph codes that
  // lost at least one pixel (each code once). Throws on non-integer deltas
  // or out-of-range new dims.
  function resizeFont(font, d) {
    var keys = ["dTop", "dBottom", "dLeft", "dRight"];
    for (var i = 0; i < 4; i++) {
      var v0 = d[keys[i]];
      if (typeof v0 !== "number" || !isFinite(v0) || v0 !== (v0 | 0))
        throw new Error("resize: " + keys[i] + " must be an integer (got " + v0 + ")");
    }
    var newW = font.width + d.dLeft + d.dRight;
    var newH = font.height + d.dTop + d.dBottom;
    var v = validateDims(newW, newH);
    if (!v.ok) throw new Error("resize: " + v.error);
    var out = cloneFont(font);
    // Rebuild the buffer at the new size, shifting ink; count clipped px.
    var src = font.data;
    var dst = new Uint8Array(NUM_GLYPHS * newH * newW);
    var inkClipped = 0, code, y, x, nx, ny;
    var clippedCodes = [], clipSeen = {};
    for (code = 0; code < NUM_GLYPHS; code++) {
      for (y = 0; y < font.height; y++) {
        for (x = 0; x < font.width; x++) {
          if (!src[((code * font.height) + y) * font.width + x]) continue;
          nx = x + d.dLeft; ny = y + d.dTop;
          if (nx < 0 || nx >= newW || ny < 0 || ny >= newH) {
            inkClipped++;
            if (!clipSeen[code]) { clipSeen[code] = true; clippedCodes.push(code); }
            continue;
          }
          dst[((code * newH) + ny) * newW + nx] = 1;
        }
      }
    }
    out.width = newW; out.height = newH; out.data = dst;
    for (var gi = 0; gi < out.guidelines.length; gi++) {
      var g = out.guidelines[gi];
      var max = (g.o === "h") ? newH : newW;
      g.off = clampInt(g.off + ((g.o === "h") ? d.dTop : d.dLeft), 0, max);
    }
    return { font: out, inkClipped: inkClipped, clippedCodes: clippedCodes };
  }

  /* ============================================================
   * [14] Changelog / version compare (DECISIONS #73)
   * ============================================================ */

  // Compare two semver-ish "X.Y.Z" strings: -1 / 0 / 1.
  // Lenient by design: missing/invalid components count as 0, so a
  // corrupted stored version degrades to 0.0.0 (=> "show everything")
  // rather than breaking the what's-new check.
  function cmpVersions(a, b) {
    function p(v) {
      var parts = String(v).split("."), out = [], i, n;
      for (i = 0; i < 3; i++) {
        n = parseInt(parts[i], 10);
        out.push(isFinite(n) ? n : 0);
      }
      return out;
    }
    var pa = p(a), pb = p(b), i;
    for (i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    return 0;
  }

  // Entries a user coming from lastVersion has not seen yet: every entry
  // strictly NEWER than lastVersion, in the changelog's own order (newest
  // first). lastVersion null/empty/invalid => ALL entries (first run);
  // lastVersion >= newest entry => [] (nothing new, e.g. same or downgraded).
  function changelogSince(changelog, lastVersion) {
    if (!lastVersion) return changelog.slice();
    var out = [], i;
    for (i = 0; i < changelog.length; i++) {
      if (cmpVersions(changelog[i].version, lastVersion) > 0) out.push(changelog[i]);
    }
    return out;
  }

  /* ============================================================
   * [15] Glyph manipulation (DECISIONS #74)
   * ============================================================ */

  // Copy the whole bitmap of glyph `from` over glyph `to`.
  // No-op when from === to (copying onto itself). Status/silences are
  // untouched — workflow metadata is user-managed (see DECISIONS #74).
  function copyGlyphTo(font, from, to) {
    if (from < 0 || from >= NUM_GLYPHS) throw new Error("copyGlyphTo: bad source code " + from);
    if (to < 0 || to >= NUM_GLYPHS) throw new Error("copyGlyphTo: bad target code " + to);
    if (from === to) return;
    var n = font.width * font.height;
    var fromBase = from * n, toBase = to * n;
    for (var i = 0; i < n; i++) font.data[toBase + i] = font.data[fromBase + i];
  }

  // Mirror glyph `code` in place. axis "h" = left<->right (flip about a
  // vertical axis); axis "v" = up<->down (flip about a horizontal axis).
  function mirrorGlyph(font, code, axis) {
    if (code < 0 || code >= NUM_GLYPHS) throw new Error("mirrorGlyph: bad code " + code);
    if (axis !== "h" && axis !== "v") throw new Error("mirrorGlyph: bad axis " + axis);
    var w = font.width, h = font.height, base = code * w * h, x, y, a, b, t;
    if (axis === "h") {
      for (y = 0; y < h; y++)
        for (x = 0; x < (w >> 1); x++) {
          a = base + y * w + x; b = base + y * w + (w - 1 - x);
          t = font.data[a]; font.data[a] = font.data[b]; font.data[b] = t;
        }
    } else {
      for (x = 0; x < w; x++)
        for (y = 0; y < (h >> 1); y++) {
          a = base + y * w + x; b = base + (h - 1 - y) * w + x;
          t = font.data[a]; font.data[a] = font.data[b]; font.data[b] = t;
        }
    }
  }

  // Printable codes (0x21..0x7E) that contain no ink at all — ascending.
  // Space (0x20) is the sanctioned empty and is never listed. Feeds the
  // "empty printable glyphs" QA check.
  function emptyPrintables(font) {
    var out = [];
    for (var code = 0x21; code <= 0x7e; code++)
      if (inkCount(font, code) === 0) out.push(code);
    return out;
  }

  /* ============================================================
   * [16] Selection rect ops (DECISIONS #75)
   * ============================================================ */

  // Normalize a drag rectangle (any corner order) into { x, y, w, h } in
  // pixel coordinates, clamped to the cw×ch cell (a point or off-cell drag
  // still yields at least a 1 px rect; the app's moved flag decides
  // click-vs-drag). Returns null only if the result has no area.
  function normRect(x0, y0, x1, y1, cw, ch) {
    function inr(v, hi) { v = Math.round(v); return v < 0 ? 0 : (v > hi ? hi : v); }
    var ax = inr(Math.min(x0, x1), cw - 1);
    var ay = inr(Math.min(y0, y1), ch - 1);
    var bx = inr(Math.max(x0, x1), cw - 1);
    var by = inr(Math.max(y0, y1), ch - 1);
    if (bx < ax || by < ay) return null;
    return { x: ax, y: ay, w: bx - ax + 1, h: by - ay + 1 };
  }

  function checkRectArgs(font, code, rect) {
    if (code < 0 || code >= NUM_GLYPHS) throw new Error("bad code " + code);
    if (!rect || rect.w <= 0 || rect.h <= 0) throw new Error("empty rect");
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > font.width || rect.y + rect.h > font.height)
      throw new Error("rect outside the cell");
  }

  // Set every pixel in the rect to value (0 = clear, 1 = fill).
  function rectFill(font, code, rect, value) {
    checkRectArgs(font, code, rect);
    value = value ? 1 : 0;
    var base = code * font.width * font.height;
    for (var y = 0; y < rect.h; y++)
      for (var x = 0; x < rect.w; x++)
        font.data[base + (rect.y + y) * font.width + (rect.x + x)] = value;
  }

  // Toggle every pixel in the rect.
  function rectInvert(font, code, rect) {
    checkRectArgs(font, code, rect);
    var base = code * font.width * font.height;
    for (var y = 0; y < rect.h; y++)
      for (var x = 0; x < rect.w; x++) {
        var i = base + (rect.y + y) * font.width + (rect.x + x);
        font.data[i] = font.data[i] ? 0 : 1;
      }
  }

  // Place a rect's snapshot by (dx, dy), clipped at the cell edge.
  //   mode  "merge"   — the selection's INK is stamped on top; existing
  //                     destination ink is kept (transparent parts of the
  //                     selection erase nothing).
  //         "replace" — the destination becomes exactly the selection's
  //                     content: ink lands, transparent parts erase whatever
  //                     was there.
  //   cut   true — the source rect is cleared (a move);
  //         false — the source is left as-is (a copy).
  // Overlapping source/target is safe (the source is read from a snapshot
  // before anything is written). Returns { moved, clipped } — ink counts.
  function placeRect(font, code, rect, dx, dy, mode, cut) {
    checkRectArgs(font, code, rect);
    if (mode !== "merge" && mode !== "replace") throw new Error("bad paste mode " + mode);
    dx = Math.round(dx); dy = Math.round(dy);
    if (dx === 0 && dy === 0) return { moved: 0, clipped: 0 };
    var w = font.width, h = font.height, base = code * w * h, snap = [];
    var moved = 0, clipped = 0, x, y, tx, ty, v;
    for (y = 0; y < rect.h; y++)
      for (x = 0; x < rect.w; x++)
        snap.push(font.data[base + (rect.y + y) * w + (rect.x + x)]);
    if (cut)
      for (y = 0; y < rect.h; y++)
        for (x = 0; x < rect.w; x++)
          font.data[base + (rect.y + y) * w + (rect.x + x)] = 0;
    for (y = 0; y < rect.h; y++)
      for (x = 0; x < rect.w; x++) {
        v = snap[y * rect.w + x];
        if (mode === "merge" && !v) continue; // merge keeps destination ink
        tx = rect.x + x + dx; ty = rect.y + y + dy;
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) { if (v) clipped++; continue; }
        font.data[base + ty * w + tx] = v;
        if (v) moved++;
      }
    return { moved: moved, clipped: clipped };
  }

  // Move the rect's content by (dx, dy) — a CUT: the source rect is cleared,
  // the pixels land at their offset positions, off-cell ink is clipped (lost).
  // mode (optional): "merge" (default) or "replace" (DECISIONS #76).
  function rectMove(font, code, rect, dx, dy, mode) {
    return placeRect(font, code, rect, dx, dy, mode || "merge", true);
  }

  // Like rectMove but a COPY: the source rect is left as-is.
  function rectMoveCopy(font, code, rect, dx, dy, mode) {
    return placeRect(font, code, rect, dx, dy, mode || "merge", false);
  }

  // Copy the rect's exact pixels (ink AND transparent) from glyph `from` to
  // glyph `to`, at the SAME cell position — a paste, not a stamp. `from` is
  // untouched. (rects must fit both cells — they share the same cell size.)
  function rectCopy(font, from, to, rect) {
    checkRectArgs(font, from, rect);
    if (to < 0 || to >= NUM_GLYPHS) throw new Error("bad target code " + to);
    var w = font.width, baseF = from * w * font.height, baseT = to * w * font.height;
    for (var y = 0; y < rect.h; y++)
      for (var x = 0; x < rect.w; x++)
        font.data[baseT + (rect.y + y) * w + (rect.x + x)] =
          font.data[baseF + (rect.y + y) * w + (rect.x + x)];
  }

  /* ============================================================
   * API
   * ============================================================ */
  var api = {
    VERSION: VERSION,
    NUM_GLYPHS: NUM_GLYPHS,
    // model
    validateDims: validateDims,
    makeFont: makeFont,
    inBounds: inBounds,
    getPixel: getPixel,
    setPixel: setPixel,
    clearGlyph: clearGlyph,
    rowBits: rowBits,
    rowBitsString: rowBitsString,
    // verilog
    toVerilog: toVerilog,
    // markup
    parseMarkup: parseMarkup,
    // slant
    slantRowOffset: slantRowOffset,
    // ink / luminance
    luminance: luminance,
    isInk: isInk,
    // navigation
    navigate: navigate,
    // shift
    shiftGlyph: shiftGlyph,
    // status / QA
    inkCount: inkCount,
    statusCounts: statusCounts,
    findDuplicates: findDuplicates,
    // BDF
    parseBDF: parseBDF,
    toBDF: toBDF,
    // font name
    sanitizeFontName: sanitizeFontName,
    filenameBase: filenameBase,
    // cell resize (DECISIONS #71)
    cloneFont: cloneFont,
    resizeFont: resizeFont,
    // changelog (DECISIONS #73)
    cmpVersions: cmpVersions,
    changelogSince: changelogSince,
    // glyph manipulation (DECISIONS #74)
    copyGlyphTo: copyGlyphTo,
    mirrorGlyph: mirrorGlyph,
    emptyPrintables: emptyPrintables,
    // selection rect ops (DECISIONS #75)
    normRect: normRect,
    rectFill: rectFill,
    rectInvert: rectInvert,
    rectMove: rectMove,
    rectMoveCopy: rectMoveCopy,
    rectCopy: rectCopy,
    // edge-ink QA
    edgeInk: edgeInk,
    // guideline-violation QA
    GUIDE_BOUND_LABELS: GUIDE_BOUND_LABELS,
    guideBounds: guideBounds,
    guideViolations: guideViolations,
    // project file
    PROJECT_APP: PROJECT_APP,
    PROJECT_KIND: PROJECT_KIND,
    PROJECT_VERSION: PROJECT_VERSION,
    fontToBlob: fontToBlob,
    fontFromBlob: fontFromBlob,
    projectToObj: projectToObj,
    objFromProject: objFromProject
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    (root || (root = {})).BF = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this));
