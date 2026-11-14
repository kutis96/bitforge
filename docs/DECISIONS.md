# bitforge — Decisions (locked)

Requirements and design decisions agreed with the user. **Treat these as fixed** unless the user explicitly re-opens one. If a decision looks wrong, flag it — don't silently change it.

## Format & data
1. **No native/JSON project file.** PNG atlas is the working format; Verilog is export-only.
2. Exactly **256 glyphs** per font, 8-bit codepoints (0–255), "ASCII-ish". No Unicode beyond 8-bit.
3. Atlas is always **16×16** characters.
4. Glyph size **W×H is parametric per font**, default **8×16**. Any positive integer, soft-capped ~1–64.
5. **Import** derives W = imgWidth÷16, H = imgHeight÷16; **throw an error if not a whole number.**
6. Pixel semantics: `1` = ink (black), `0` = transparent (white/background).

## Import (PNG)
7. Ink test: **composite pixel over white, luminance < 128 ⇒ ink.** (Covers black-on-white, transparent backgrounds, and light checkerboard cell borders.)

## Export
8. **PNG:** exactly `16W × 16H` (1px per bit). Ink = black. Background = **white or transparent** (user toggle).
9. **Verilog `$readmemb`:** binary, one line per row, `width` bits/line, **rightmost pixel = MSB** (visual row reversed), top→bottom, glyph 0 first, `256*height` lines, `1`=ink/`0`=transparent, **no headers/comments**.

## Rendering
10. **Artificial bold:** double-draw with a **1px** horizontal offset.
11. **Slant:** per-row horizontal offset. Baseline row = offset **0** (selectable, default **line 5 from the bottom**). Rows above the baseline → **non-negative** offset; rows below → **negative** offset. Slanted glyphs **spill into neighbours** (ink-only compositing). Exact per-row math is an implementation detail in a small module.
12. All rendering is **ink-only** (black) over a transparent/white background → overlaps compose correctly.

## UI / UX
13. **Black on white** (explicitly **not** green/amber). Monospace, terminal-tool aesthetic.
14. Layout: **left glyph-selector sidebar** + main tabs **[ Edit | Preview | Atlas ]**.
15. Editor **and** glyph preview both show the **hex code + printable char** (char shown for `0x20`–`0x7E`).
16. **Editing:** left-click toggles, left-drag paints, right-drag erases; undo/redo.
17. **Preview tab:** single-glyph zoom (scale + bold + slant + baseline) **and** multi-line text sample.
18. **Selector:** 16×16 mini-glyph grid + jump field (hex or literal char).
19. Preview **scale ≈ 1×–16×**.

## Preview markup
20. `*bold*`, `_italic_` (nestable for both), **`\uXX`** (2 hex digits) for unprintables. `*`/`_` toggle the attribute; a **literal** `*`/`_` is typed as `\u2A`/`\u5F`.
21. Typed char **> 255** → **red square** (glyph-sized).

## Tech
22. **Vanilla JS, single-page, no build, no dependencies, no ES modules** (must run from `file://`). Single self-contained `index.html`, or split into `css/` + `js/` (plain scripts) — either is fine.
23. **No Go backend, no Node/TS.** No server component.
24. PNG I/O via `<canvas>` (no PNG library).
25. **localStorage** auto-save as the only persistence (no project file).
26. **Code split:** `js/core.js` = pure, DOM-free logic (global `BF`); `js/app.js` = DOM wiring (canvas, events, file ops). Keep pure logic in `core.js` so it stays testable.
27. **Unit tests run headlessly** under macOS JavaScriptCore (`jsc`) via `test/run-tests.sh`; no Node/browser. DOM code is verified in a browser.

## Editor guidelines
28. **Guidelines are editor-only.** Stored per-font in `Font.guidelines[]` (`{ o: "h"|"v", off, label, color }`, `off` in glyph-pixel units), persisted to `localStorage` with the font, **never exported** to PNG or Verilog.
29. **Shared per font**, not per glyph. Offsets clamp to `0..(dim-1)` (the line must stay on the canvas). Saved entries are sanitized on load (localStorage is user-editable).
30. **Hard to move/remove by accident:** a global **lock is ON by default** (dragging disabled; pixel editing unaffected). Guides are added via preset buttons (ascender / cap / x-height / baseline / descender / left / right / free H / free V), moved by dragging when unlocked (hover shows a resize cursor), and removed via the `×` on their chip in the live list.
31. Preset default offsets are computed from W/H (e.g. baseline = `H-3`, descender = `H-1`, x-height = `round(H*0.40)`); exact values/colors live in `GUIDE_PRESETS` in `js/app.js` and are tunable.

## Deferred / finalize in implementation
- Exact slant offset-per-row formula (contract in #11).
- Undo/redo history cap.
- Multi-line preview wrapping / scroll behavior.
- Right-drag vs Shift-drag for erase (suppress context menu on canvas).
