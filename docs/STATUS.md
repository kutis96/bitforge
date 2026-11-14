# bitforge — Status

## Current state
- [x] Requirements gathered and clarified with the user
- [x] Design docs written
- [x] Test harness in place (headless under macOS `jsc`; see [TESTING.md](TESTING.md))
- [x] **[A] model** in `core.js` — 12 tests
- [x] **[B] Verilog export** in `core.js` — 5 tests
- [x] **[C] markup parser** in `core.js` — 10 tests
- [x] **[D] slant offsets** in `core.js` — 7 tests
- [x] **[E] ink / luminance test** in `core.js` — 9 tests
- [x] **[F] DOM layer** — `index.html` + `css/style.css` + `js/app.js` (45 tests incl. 2 DOM smoke)
- [x] **[G] Editor guidelines** — per-font H/V guides in the editor (preset add, drag, lock, list); test count unchanged (DOM-only, smoke-covered)
- [x] **[H] Selector click-to-select** — click a mini-glyph in the left sidebar atlas to select it (user request); 1 new headless test via stub event dispatch
- [ ] **[I] polish** ← next (edge cases, cosmetic)

Pure-logic chunks (A–E) are fully unit-tested headlessly; the DOM chunks (F–G) are smoke-tested headlessly and need browser verification for visuals.

## Verify work (no browser needed for pure logic)

```sh
cd bitforge && ./test/run-tests.sh   # exit 0 = all pass
```
Full guide (why `jsc`, how to write tests, conventions): [TESTING.md](TESTING.md).
DOM code is checked by opening `index.html` in a browser.

## Completed

### [A] Font model (`js/core.js`)
- `makeFont(w,h)` (blank, throws on bad dims), `validateDims`, `inBounds`.
- `getPixel` / `setPixel` / `clearGlyph` — `1`=ink, `0`=transparent, row-major per glyph.
- `rowBits` (numeric, width≤32) and `rowBitsString` (string, any width; **MSB = rightmost pixel**, i.e. visual row reversed).
- 12 tests.

### [B] Verilog export (`js/core.js`)
- `toVerilog(font)` → `256*height` binary lines + trailing newline; rightmost pixel = MSB (visual row reversed), glyph 0 first, `1`=ink/`0`=transparent, no headers.
- 5 tests (line count, per-line width, glyph order + MSB, glyph-N offset, all-ink row).

### [C] Preview markup parser (`js/core.js`)
- `parseMarkup(text)` → array of `{ code, bold, italic, ok }` (one per glyph).
  - `*` toggles bold, `_` toggles italic (nestable/combining); `\uXX` (2 hex) → codepoint.
  - `ok=false` (code `-1`) for chars outside 8-bit (incl. surrogate pairs) → app draws a red square.
  - Bare `*`/`_` are markup; a **literal** `*`/`_` is written `\u2A`/`\u5F`.
- 10 tests.

### [D] Slant offsets (`js/core.js`)
- `slantRowOffset(y, height, baselineFromBottom, slope)` → per-row horizontal offset = `floor((baseline - y) / slope)`.
  - baseline row (0-based from bottom, default 5) = 0; above → ≥ 0, below → < 0; positive = right (leans "/"); default slope 2 (1px/2rows).
- 7 tests (baseline=0, sign above/below, slope step, defaults, monotonic, baseline shift).
- Per-row canvas blit is in `app.js` (chunk F).

### [E] Ink / luminance test (`js/core.js`)
- `isInk(r, g, b, a)` → true if ink: composite over white, then luma < 128 (DECISIONS #7).
  - `luminance(r,g,b)` is integer BT.601 (weights sum to 65536) so gray v → v exactly; keeps the `<128` boundary exact (a float luma gave 127.999… at gray 128).
  - Covers black-on-white, transparent bg, and light checkerboard borders.
- 9 tests.

### [F] DOM layer (`index.html` + `css/style.css` + `js/app.js`)
- **Shell:** toolbar (New / Open PNG / Export PNG / Export Verilog / transparent-bg), left sidebar (selector grid + `hex · char` header + jump), tabs Edit/Preview/Atlas. Black-on-white, monospace, no checkerboard.
- **Render (`drawGlyphTo`):** ink-only, integer scale; artificial bold = +1px double-draw; slant = per-row `BF.slantRowOffset`; red square for undisplayable.
- **Editor:** left-click toggle, left-drag paint, right-drag/Shift erase; stroke-based undo/redo (buttons + Ctrl/⌘+Z, Shift=redo); Clear glyph.
- **Preview:** glyph zoom (scale/bold/italic/baseline) + multi-line text via `BF.parseMarkup` (wraps, red squares). **Atlas:** 256 grid.
- **File ops:** PNG import (÷16, error, `BF.isInk`), PNG export (1px/bit, white or transparent), Verilog export (`BF.toVerilog` → `.mem`), New (prompt W×H), localStorage auto-save/restore.
- **Headless:** `test/stub-dom.js` + `test/test-dom.js` run `init()` under a DOM stub and assert canvas sizing + persistence (2 tests). Full visual/DOM behavior still needs a real browser.

### [G] Editor guidelines (`js/app.js` + `index.html` + `css/style.css`, 2026-11-14)
Per-font shared editor guides, editor-only (DECISIONS #28–31):
- **Data:** `Font.guidelines = []`; entries `{ o: "h"|"v", off (int, glyph-px), label, color }`. Added to `BF.makeFont` (`core.js`).
- **UI:** guidelines bar above the editor canvas — lock checkbox (locked by default), 9 preset add buttons (asc / cap / x / base / desc / |L / |R / +H / +V), live chip list with `×` remove.
- **Behavior:** drawn as 1px colored lines over the glyph in `drawEditor()`; when unlocked, hover within 4 display-px shows a resize cursor and drag moves the guide (offset clamped to `0..dim-1`); pixel editing is unaffected by the lock.
- **Persistence:** saved/restored via `localStorage` under key `g`; sanitized on load (shape + integer offset checked; defaults for missing label/color).
- **Bugs found & fixed during review** (feature was untested when handed off):
  1. `renderGuideList()` was called in `init()` **before** the font existed → `state.font.guidelines` on null crashed init. Removed the premature call (`setFont()` already renders the list).
  2. **Infinite loop in the real browser:** the preset-button loop was `for (var gi = 0; gi < gbtns.length; i++)` — it declared `gi` but incremented `i` (a different, earlier variable), so `gi` never advanced and the loop re-bound button 0 forever. The stub's `querySelectorAll` returned `[]`, so the loop never ran under `jsc` and the bug was invisible. Fixed the index **and** made the stub return fake `.tab` / `.gadd button` element lists so these loops now execute in tests.
  3. Guide offsets could be set to exactly `dim` → line drawn at `canvas+0.5px` (off-canvas, lost). Clamped to `dim-1`.
- **Test harness hardening:** `run-tests.sh` now runs `jsc` under a 60 s watchdog (hang → fail, exit 1), so a reintroduced infinite loop fails the run instead of stalling. See TESTING.md.
- **Browser-verified by the user** (2026-11-14): guides render/drag/lock/remove, and general editing feels good.

### [H] Selector click-to-select (`js/app.js` + `index.html`, 2026-11-14)
User requested: clicking the left-sidebar atlas (mini-glyph grid) selects the glyph, instead of only the jump field. The design doc always claimed "click to select" but no handler was ever wired — it was a pure render. Now:
- `click` on `#selector` maps position → 16px cell → `code = row*16 + col` → `selectGlyph()` (same getBoundingClientRect pattern as the editor; safe because `setCanvasSize` pins CSS size to internal size). Out-of-grid clicks are ignored.
- Pointer cursor + `title` tooltip on the canvas.
- **New headless test** (`test-dom.js`): the DOM stub now records listeners per element and exposes `__stub.dispatch(id, type, evt)`; the test synthesizes clicks on three cells (0x21 printable, 0x00, 0xFF) and asserts the selection header updates. Total 46 tests.
- Browser-verified by the user (guidelines + this, 2026-11-14).

## Next up — [I] polish
Browser-verify the visuals and interactions (the agent can't screenshot). Likely small fixes: slant spill clipping, jump UX, preview wrap width, hover cursor on the editor, layout nits, guidelines visual polish (line thickness, colors).

**Fixed during review (user-reported):** editor click→cell mismatch + non-square cells. The canvas CSS size wasn't pinned, so flexbox stretched it to the panel and `getBoundingClientRect()` no longer matched the internal pixel size. Fix: `setCanvasSize()` pins `style.width/height` to the internal size; `.canvas-wrap canvas { flex: 0 0 auto }` stops the stretch; the wrapper scrolls instead. Now 1 internal px = 1 CSS px in all browsers. Regression-tested in `test-dom.js` (asserts CSS size == internal size).

## Open items / verify during implementation
- Slant per-row formula — implement to the DECISIONS #11 contract; tune the constant.
- Confirm `file://` works with the chosen file layout (plain scripts, no modules).
- PNG import edge cases: dims not a multiple of 16 (must error), semi-transparent pixels, light checkerboard borders.
- Verilog bit-order is covered by tests; still re-check against a real exported file in the browser.

## Notes for the next agent
- Read [DECISIONS.md](DECISIONS.md) first — most things are locked; don't re-litigate.
- Read [TESTING.md](TESTING.md) before touching `js/core.js` or adding tests.
- **Run `./test/run-tests.sh` after any change to `js/core.js`.**
- Keep pure logic in `js/core.js` (testable); put DOM/canvas in `js/app.js`.
- Ink = 1/black; transparent = 0/white. Keep that consistent everywhere.
