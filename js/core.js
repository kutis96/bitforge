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
 */
(function (root) {
  "use strict";

  var NUM_GLYPHS = 256;
  var MAX_DIM = 1024; // hard cap (expected range ~1..64); keeps Uint8Array sane

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
      status: new Uint8Array(NUM_GLYPHS) // 0=unfinished 1=wip 2=done (DECISIONS #38); NOT exported
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
   *        `\uXX` (2 hex digits) -> codepoint 0xXX;
   *        a literal `*`/`_` is written as `\u2A`/`\u5F`.
   * ============================================================ */

  function isHex(ch) {
    if (ch == null) return false;
    return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
  }

  function parseMarkup(text) {
    var out = [];
    var bold = false;
    var italic = false;
    var i, c, cp, ok;
    for (i = 0; i < text.length; i++) {
      c = text.charAt(i);
      if (c === "*") { bold = !bold; continue; }
      if (c === "_") { italic = !italic; continue; }
      if (c === "\\" && text.charAt(i + 1) === "u" && isHex(text.charAt(i + 2)) && isHex(text.charAt(i + 3))) {
        out.push({ code: parseInt(text.slice(i + 2, i + 4), 16), bold: bold, italic: italic, ok: true });
        i += 3;
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
   * API
   * ============================================================ */
  var api = {
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
    findDuplicates: findDuplicates
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    (root || (root = {})).BF = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this));
