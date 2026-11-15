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
  var VERSION = "0.14.3";

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
    return { width: w, height: h, data: data };
  }

  function toBDF(font) {
    var w = font.width, h = font.height, L = [];
    L.push("STARTFONT 2.1");
    L.push("COMMENT Generated by bitforge");
    L.push("FONT \"bitforge\"");
    L.push("FAMILY \"bitforge\"");
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
    var b = guideBounds(font), out = [];
    if (b.top && minR < b.top.off) out.push({ bound: "top", label: b.top.label, over: b.top.off - minR });
    if (b.bottom && maxR > b.bottom.off) out.push({ bound: "bottom", label: b.bottom.label, over: maxR - b.bottom.off });
    if (b.left && minC < b.left.off) out.push({ bound: "left", label: b.left.label, over: b.left.off - minC });
    if (b.right && maxC > b.right.off) out.push({ bound: "right", label: b.right.label, over: maxC - b.right.off });
    return out;
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
    // edge-ink QA
    edgeInk: edgeInk,
    // guideline-violation QA
    GUIDE_BOUND_LABELS: GUIDE_BOUND_LABELS,
    guideBounds: guideBounds,
    guideViolations: guideViolations
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    (root || (root = {})).BF = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this));
