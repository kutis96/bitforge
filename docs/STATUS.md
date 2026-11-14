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
- [x] **[J] Ergonomics update** (2026-11-14): keyboard nav, reference glyph, keyboard glyph shift, shortcut registry + reference card, inverted preview, atlas bold/slant, settings persistence — 65 tests
- [x] **[K] QA update** (2026-11-14): glyph status (unfinished/WIP/done), QA tab with stale indicator, duplicate + "left to draw" checks — 77 tests
- [x] **[L] Interop** (2026-11-14): BDF import/export (app wiring) + copy glyph to clipboard — 90 tests
- [x] **[I.1] File-op & tab shortcuts** (2026-11-14): Alt/Ctrl file-op + E/P/A/Q/Ctrl+Q shortcuts, registry-based, input-suppressed — 93 tests
- [x] **[I.2] Preview markup escapes** (2026-11-14): `\*` `\_` `\\` backslash escapes in the preview text — 98 tests
- [ ] **[I] polish** — catch-all (edge cases, cosmetic)

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

### [J] Ergonomics update (`core.js` + `app.js` + `index.html` + `css/style.css`, 2026-11-14)
- **J1 Navigation:** `BF.navigate(code, dir)` in `core.js` (left/right ±1, up/down ±16, **rowStart/rowEnd = col 0/15 of current row**, top/bottom, clamps). Wired via shortcuts. 5 tests.
- **J2 Reference glyph:** Shift-click in the sidebar sets/clears `state.ref` (session-only); drawn as a gray underlay in the editor (`drawGlyphTo` gained `opts.color`); gray outline on the ref cell in the selector.
- **J3 Glyph shift:** `BF.shiftGlyph(font, code, dx, dy)` in `core.js` (clips out-of-bounds ink, returns `{clipped, changed}`); `Ctrl/⌘+arrows`; one undo step; toast when ink is clipped. 7 tests.
- **J4 Shortcut registry:** `shortcuts.register({combo, description, handler})` in `app.js`; one global keydown dispatcher (suppressed while an input/textarea has focus; `⌘` = Ctrl; `?` works despite needing Shift). The **reference card** (toolbar `?` button or `?` key) renders from the registry — no drift. All 16 bindings (8 nav + 4 shift + 3 undo/redo + 1 card) registered; old raw keydown removed.
- **J5 Inverted preview:** `pv-inverted` checkbox; `inkColor()`/`bgColor()` helpers; preview glyph/text/atlas surfaces flip to white-on-black; editor + sidebar untouched.
- **J6 Atlas effects:** atlas renders with the current bold/italic/baseline; column spacing `+maxSlant/bold` while on, left pad so left-spill isn't clipped (regression-tested: slanted atlas width).
- **J7 Settings API:** `settingsGet/settingsSet` + `settingsDefaults` table over `bitforge.settings.v1` (type-checked on load, corrupted ⇒ defaults). Persists pvText/pvScale/pvBold/pvItalic/pvBaseline/inverted; controls wired through it. **Rule: new persistable value ⇒ defaults table + API.**
- **Test seam:** `__stub.app = { state, shortcuts, selectGlyph, toggleKeysCard }` (only under the jsc stub) — 7 new headless DOM tests drive the registry and settings. **Total 65 tests.**
- Stub gained a `clearTimeout`/`setTimeout` polyfill (jsc lacks them; `toast()` uses them).
- **Not yet done:** browser visual check (card layout, inverted look, atlas spacing) — user to verify.

### [K] QA update (`core.js` + `app.js` + `index.html` + `css/style.css`, 2026-11-14)
- **K1 Status:** `Font.status` = `Uint8Array(256)` in `BF.makeFont`; persisted in the font blob under key `s` (sanitized on load: only 0/1/2, length 256); absent ⇒ unfinished. `setStatus(code, st)` coerces invalid values.
- **K2 Assignment/display:** Atlas tab left-click selects (geometry-aware `atlasCellAt` using the last `drawAtlas` geo, incl. slanted pad/colW), **right-click opens a floating 3-choice status menu** (browser context menu suppressed). Tints: WIP `#ffe8dd`, unfinished `#eef4ff`, done = plain (dark variants `#3a2a22`/`#20293a` when inverted); atlas + sidebar selector.
- **K3 QA tab (4th):** violations table + **Refresh checks** button + **stale badge**. `state.fontVersion` bumps on every mutation (stroke end, clear, shift, status change; reset per font via `setFont`); report stores its computed version; mismatch ⇒ badge. `qaReset()` on font swap clears the table to the placeholder.
- **K4 Checks (registered data, `qaChecks`):** **duplicate glyphs** (`BF.findDuplicates` — identical-bitmap groups, all-empty group excluded, ink count reported) and **what's left to draw** (`BF.statusCounts` — summary row + one clickable row per unfinished/WIP glyph; clicking jumps to Edit). 9 new core tests + 3 new DOM tests. **Total 77 tests.**
- Seam extended: `setStatus`, `qaRefresh`, `qaRows`, `qaStale`, `atlasCellAt` on `__stub.app`.
- **Not yet done:** browser visual check (tints, menu placement, table look) — user to verify.

### [L] Interop (`core.js` + `app.js` + `index.html` + `test/`, 2026-11-14)
- **L1 BDF import/export (app wiring):** the core `BF.parseBDF`/`BF.toBDF` (DECISIONS #43) landed first with 8 tests in `test/test-bdf.js`. Toolbar **Open BDF** (hidden `#file-bdf`, text read via `file.text()` with a `FileReader` fallback) → `importBdfText(text, name)`: `BF.parseBDF` → `BF.makeFont(w,h)` + data copy → `setFont()` (status/guidelines fresh) + toast; malformed ⇒ error toast with the parser message, current font untouched, returns `false`. **Export BDF** mirrors `exportVerilog`'s download pattern → `bitforge-font.bdf`.
- **L2 Copy glyph to clipboard (DECISIONS #44):** toolbar **Copy glyph** → `glyphCanvas(code, 16)` (offscreen canvas, 16 display px per glyph px, black ink on transparent) → `toBlob` → PNG. `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])` when available (success/failure toasts; a rejected write also falls back to a download); otherwise **PNG download fallback** (`bitforge-glyph-XX.png`) + explanatory toast (covers `file://`).
- **Test seam/stub extensions:** seam gained `importBdfText`, `exportBdf`, `copyGlyph`, `glyphCanvas`, `getLastToast` (toast() now records `lastToast`). The DOM stub gained `navigator`/`ClipboardItem`/`FileReader` globals, a configurable `toBlob` (passes `__stub.blob || null`), and `__stub.setClipboard("available"|"none")` + `__stub.clipboardCalls` (synchronously-settling thenable — no reliance on jsc microtask flushing). See TESTING.md.
- **6 new DOM tests** (BDF import success/malformed, export smoke, glyphCanvas size, clipboard fallback + rasterize-fail toast, clipboard success) → **total 90 tests.**
- **Not yet done:** browser verification — BDF round-trip with a real file, clipboard copy, plus the still-unverified visuals from J & K (keys card layout, inverted preview look, atlas slant spacing, status tints, status menu placement, QA table look). The agent can't screenshot; the user verifies.

### [I.1] File-op & tab keyboard shortcuts (`app.js` + `test/`, 2026-11-14)
User-requested shortcuts for existing features (their list was a weak suggestion; tweaks documented in DECISIONS #48):
- **Registered (11 new, registry total 27):** `Alt+N` new font · `Alt+O` open PNG · `Alt+Shift+O` open BDF · `Ctrl+S` export PNG · `Ctrl+Shift+S` export Verilog · `Alt+Shift+S` export BDF · `E/P/A/Q` show Edit/Preview/Atlas/QA tab · `Ctrl+Q` QA tab + run checks. **Ctrl+N / Ctrl+O became Alt** — the browser reserves them (new window / open file, uninterceptable). BDF shortcuts added for completeness.
- **Registry extended for Alt:** `comboOf` now emits `Alt`/`Alt+Shift` prefixes and, for Alt+letter combos, normalizes the key from layout-independent `evt.code` (`KeyN` → `n`) — because macOS Option+N types `∩` into `evt.key`. The `?` reference card picks all of this up automatically (rendered from the registry).
- **Input suppression** (the user's explicit concern: char-search typing must not trigger shortcuts) — already handled by the dispatcher's `document.activeElement` check; now *tested*: the DOM stub's `activeElement` is a settable property, and a test asserts `q`/`Ctrl+S` are ignored while an INPUT/TEXTAREA has focus and work again after.
- **Tests:** 3 new (comboOf normalization, dispatch of all new bindings end-to-end, input suppression) + the chunk-J registry-count assertion updated 16 → 27. **Total 93 tests.**

### [I.2] Preview markup backslash escapes (`core.js` + `test/` + `index.html`, 2026-11-14)
User request: be able to *type* `*` and `_` in the preview text without toggling formatting.
- `BF.parseMarkup` (pure logic, `core.js` section [3]) now handles backslash escapes: `\*` → literal `*` (0x2A), `\_` → literal `_` (0x5F), `\\` → literal `\` (0x5C); `\uXX` unchanged. Unknown `\x` → literal `\` followed by `x` parsed normally — so a lone/trailing backslash stays a literal (the pre-existing behavior, regression-tested).
- Escapes inherit the current bold/italic flags like any other glyph (e.g. `*\**` → one bold `*`).
- 5 new tests in `test/test-markup.js`; the preview textarea placeholder now mentions the escapes. **Total 98 tests.**

## Plan — remaining chunks (decisions locked in DECISIONS #32–49)

### [M] Deferred QA checks (documented, NOT to build without re-greenlight)
- Edge-ink lint — only with per-glyph silencing (box-drawing chars touch edges by design) (#46)
- Guideline-violation report — after QA infra proven (#47)

### [I] Polish (catch-all)
Browser-verify the visuals and interactions (the agent can't screenshot). Likely small fixes: slant spill clipping, jump UX, preview wrap width, hover cursor on the editor, layout nits, guidelines visual polish (line thickness, colors).

**Handover note for the next agent:** A–L are done. Remaining: [M] deferred QA checks (**not to build without re-greenlight**) and [I] polish. After each chunk: run `./test/run-tests.sh`, update this file's checkboxes + add a Completed section, commit. Pure-logic pieces belong in `core.js` with tests; DOM wiring in `app.js`.

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
