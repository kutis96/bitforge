# bitforge — Status

> **HANDOVER (2026-11-24):** all three greenlit ideas are now shipped: **[X] persist the last selected glyph** → 0.24.0; **[Y] menu-bar rearrangement** → **Project / Font / Glyph / App** → 0.25.0; **[Z] dogfooding mode** (use the font being edited as bitforge's own UI font, with safe fallback) **+ Export TTF + `tools/verify-ttf.py`** → 0.26.0 (**done**); **[Z.1] Beta badges** on Dogfood / Open BDF / Export BDF / Export TTF → 0.26.1 (**done** — the last part of this release, per the user). 225/225 tests green + verifier PASS on Small & Cozy. Ritual, conventions and gotchas: [AGENTS.md](AGENTS.md) (root) + this file + DECISIONS.md. The `hidden`-vs-`display` CSS trap and the init-order trap are documented in DECISIONS #75 [T.1] — don't relearn them. The TTF glyf-flag gotcha (0x01, not 0x07/0x10) is documented in DECISIONS #82 — don't "simplify" it.

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
- [x] **[I] Ergonomics update** (2026-11-14): keyboard nav, reference glyph, keyboard glyph shift, shortcut registry + reference card, inverted preview, atlas bold/slant, settings persistence — 65 tests
- [x] **[J] QA update** (2026-11-14): glyph status (unfinished/WIP/done), QA tab with stale indicator, duplicate + "left to draw" checks — 77 tests
- [x] **[K] Interop** (2026-11-14): BDF import/export (app wiring) + copy glyph to clipboard — 90 tests
- [x] **[L.1] File-op & tab shortcuts** (2026-11-14): Alt/Ctrl file-op + E/P/A/Q/Ctrl+Q shortcuts, registry-based, input-suppressed — 93 tests
- [x] **[L.2] Preview markup escapes** (2026-11-14): `\*` `\_` `\\` backslash escapes in the preview text — 98 tests
- [x] **[L.3] Edit-tab glyph status** (2026-11-14): `unf`/`wip`/`done` buttons in the Edit panel head — 99 tests
- [x] **[L.4] Menu bar** (2026-11-14): desktop-style File/Edit dropdowns; PNG bg → remembered `pngBg` setting — 101 tests
- [x] **[L.5] Atlas render controls** (2026-11-14): bold/italic/baseline/inverted duplicated on the Atlas tab (shared state, two-way sync) — 102 tests
- [x] **[L.6] Preview layout** (2026-11-14): vertical stack, single-glyph zoom removed; Clear glyph gets a reddish outline — 102 tests
- [x] **[L.7] Status pumping shortcuts** (2026-11-14): `D` cycle status, `Shift+D` done + next — 103 tests
- [x] **[L.8] About menu + modal** (2026-11-14): live font info, About modal, W/H corner indicator removed; fixed the menu-item mousedown bug — 105 tests
- [x] **[M] About contents + versioning** (2026-11-15): "bitmap font editor" naming, FPGA framing dropped, credit line, `BF.VERSION` 0.13.0, chunk letters normalized — 106 tests
- [x] **[N.1] QA severity + silencing** (2026-11-15): per-check status icons (set C), summary strip, per-glyph silencing + show-silenced toggle, stub children tracking — 109 tests
- [x] **[N.2] Edge-ink QA** (2026-11-15): `BF.edgeInk` + edge-ink check (warning, silenceable per glyph) — 115 tests
- [x] **[N.3] Guideline-violation QA** (2026-11-15): `BF.guideBounds`/`BF.guideViolations` + check with guide names + overshoot in the detail — 122 tests
- [x] **[O.1] Preview control cleanup** (2026-11-15): orphaned Preview bold/italic checkboxes removed (Atlas keeps them) + markup note for `*bold*`/`_italic_`/`\uXX`/escapes — 122 tests
- [x] **[O.2] Preview newline fix** (2026-11-15): `\n` renders as a line break (blank lines kept, was N−1 breaks), markup state spans lines — 126 tests
- [x] **[O.3] Project file** (2026-11-15): `.bitforge` export/import (font + guidelines + status + silences + settings), shared blob sanitizer moved to core, confirm-on-import — 135 tests
- [x] **[O.4] Bound-guide off-by-one fix** (2026-11-15/16): guide lines are drawn *between* pixels; the bottom/right comparisons in `guideViolations` missed the first pixel past the line (`>` → `>=`, overshoot `+1`); presets reverted to h-1/w-1, which are correct under the fixed comparison (first attempt was a misdiagnosis) — 137 tests
- [x] **[O.5] Clipboard PNG atlas** (2026-11-16): copy whole PNG to clipboard (`Alt+Shift+C`, download fallback) + import PNG from clipboard (deliberately no Ctrl+V binding) — 139 tests
- [x] **[O.6] Reference-glyph hint** (2026-11-16): caption under the selector + fuller canvas title document the Shift-click reference selection — test count unchanged (DOM-only, smoke-covered)
- [x] **[O.7] Docs reorg** (2026-11-16): root `README.md` (user/dev) + `AGENTS.md` (agent handover map) replace `docs/README.md` — test count unchanged (139; version pin moved to 0.15.7)
- [x] **[O.8] Screenshot + license** (2026-11-16): user-provided screenshot → `docs/screenshot.png`, README hero image; MIT `LICENSE` — test count unchanged (139; version pin moved to 0.15.8)
- [x] **[P] Font name + Properties modal** (2026-11-16): `font.name` wired into export filenames + BDF header; imports derive the name; **Edit → Properties…** (name + live info) — 146 tests
- [x] **[Q] Cell resize** (2026-11-16): **Edit → Resize…** — per-edge row/col deltas, guides + slant baseline shift with the content, clip warning, full-font undo — 156 tests
- [x] **[Q.1] Clip warning lists glyphs** (2026-11-17): the lossy-crop confirm warning names the affected characters/codepoints (`clippedCodes` in core, full list + affected-glyph count) — 158 tests
- [x] **[R] Changelog + what's-new modal** (2026-11-17): `js/changelog.js` + `CHANGELOG.md` (backfilled), “What's new” modal on version bump (semver-aware, last-run version remembered), About → Changelog… — 162 tests
- [x] **[S] Glyph-manipulation tools** (2026-11-18): Mirror left–right (H) / up–down (V) · Copy to codepoint… (C, target becomes the selection) · empty-printable QA check (info, silenceable, flags “marked done”) — 169 tests
- [x] **[T] Editor toolbar + selection tools** (2026-11-18): paint/erase/select toolbar · rectangular marquee with fill/clear/invert/copy/copy-to + move-by-drag (cut, clipped) · Esc deselects — 177 tests
- [x] **[T.1] Toolbar polish** (2026-11-18): selbar hidden-until-selection bug fixed (CSS `[hidden]` guard) · toolbar moved below + enclosed like the guidelines bar (context-area semantics) · collapsible guidelines bar (persisted) — 178 tests
- [x] **[T.2] Rollback: collapsible guides bar** (2026-11-18): the [T.1] collapse feature removed per user retraction (bar always visible again); the selbar fix + toolbar position/enclosure stay — 177 tests
- [x] **[U] Move/copy paste modes** (2026-11-19): `paste: merge ⇄ replace` toggle in the selection bar (setting, default merge) · **Ctrl/Alt+drag = copy** the selection (source kept) — 180 tests
- [x] **[V] Sample fonts: infrastructure** (2026-11-22): `js/samples.js` registry (embedded `.bitforge` strings) · File → **Load sample…** picker (empty state included) · first-run preloads the default sample (saved font always wins) · suite validates every shipped entry — 184 tests *(superseded in part by [V.1])*
- [x] **[V.1] Server-served sample fonts** (2026-11-22): `samples/` folder + `manifest.json` replace the embedded registry (deleted) · **Load sample… hidden unless served over http(s)** · first-run default-sample preload gated on served (identity-guarded) · **Small & Cozy** = first sample · harness now awaits async tests (fake `fetch`/`location`) — 185 tests
- [x] **[W] Dark mode** (2026-11-23): **Edit → Theme: Light / Dark / Auto** (auto = default, live system-scheme reactivity) · theme as a **setting** (persisted + rides `.bitforge`) · CSS custom-property palettes · editor + selector canvases follow the theme; Preview/Atlas surfaces + exports deliberately unthemed — 190 tests
- [x] **[X] Persist the last selected glyph** (2026-11-23): `selCode` setting (persisted, rides `.bitforge`) · restored on start + import · Small & Cozy sample opens at 0x42 — 196 tests
- [x] **[Y] Menu-bar rearrangement** (2026-11-23): four menus — **Project** (all file I/O) · **Font** (info line, Properties…, Resize…) · **Glyph** (undo/redo, clear, mirror, copy, status) · **App** (theme, changelog, about) · "Load sample…" → "Open sample…" — 196 tests
- [ ] **[O] polish** — catch-all (edge cases, cosmetic)

Pure-logic chunks (A–E) are fully unit-tested headlessly; the DOM chunks (F–G) are smoke-tested headlessly and need browser verification for visuals.

## Versions

`BF.VERSION` in `js/core.js` — shown in the About modal head and the browser tab. Bump rule ([DECISIONS.md #56](DECISIONS.md)): **0.MINOR.PATCH** — MINOR = the chunk's position (1-indexed) in the Current-state list above; PATCH = 0 for a single chunk, the sub-index for a wave. Bump in the same commit as the chunk; a headless test pins the exact value. **A bump also requires a changelog entry in `js/changelog.js` + `CHANGELOG.md` in the same commit** (DECISIONS #73) — the data-sanity test fails if the newest entry doesn't match `BF.VERSION`. Procedure: the **"How to add an entry"** section in `CHANGELOG.md`.

| Version | Chunk |
|---------|-------|
| 0.1.0 – 0.8.0 | [A]–[H]: model · verilog · markup · slant · ink · DOM · guidelines · selector |
| 0.9.0 | [I] Ergonomics |
| 0.10.0 | [J] QA |
| 0.11.0 | [K] Interop |
| 0.12.1 – 0.12.8 | [L.1]–[L.8]: shortcuts · escapes · status buttons · menu bar · atlas controls · preview layout · pumping · About |
| 0.13.0 | [M] About contents + versioning |
| 0.14.1 | [N.1] QA severity + silencing |
| 0.14.2 | [N.2] Edge-ink QA |
| 0.14.3 | [N.3] Guideline-violation QA |
| 0.15.1 | [O.1] Preview control cleanup |
| 0.15.2 | [O.2] Preview newline fix |
| 0.15.3 | [O.3] Project file (.bitforge) |
| 0.15.4 | [O.4] Bound-guide off-by-one fix |
| 0.15.5 | [O.5] Clipboard PNG atlas |
| 0.15.6 | [O.6] Reference-glyph hint |
| 0.15.7 | [O.7] Docs reorg (root README + AGENTS.md) |
| 0.15.8 | [O.8] Screenshot + MIT license |
| 0.16.0 | [P] Font name + Properties modal |
| 0.17.0 | [Q] Cell resize (Resize… modal) |
| 0.17.1 | [Q.1] Clip warning lists affected glyphs |
| 0.18.0 | [R] Changelog + what's-new modal |
| 0.19.0 | [S] Glyph-manipulation tools (mirror, copy-to, empty-printable QA) |
| 0.20.0 | [T] Editor toolbar + selection tools |
| 0.20.1 | [T.1] Toolbar polish (hidden selbar fix, toolbar enclosure/position, collapsible guides) |
| 0.20.2 | [T.2] Rollback: collapsible guides bar removed (user retraction) |
| 0.21.0 | [U] Move/copy paste modes (merge/replace toggle + Ctrl/Alt-drag copy) |
| 0.22.0 | [V] Sample fonts: embedded registry + Load sample… picker + first-run preload (superseded in part by 0.22.1) |
| 0.22.1 | [V.1] Server-served sample fonts (samples/ + manifest.json) |
| 0.23.0 | [W] Dark mode (theme: light / dark / auto) |
| 0.24.0 | [X] Persist the last selected glyph (`selCode` setting; sample opens at 0x42) |
| **0.25.0** (current) | [Y] Menu-bar rearrangement (Project / Font / Glyph / App) |

**Lettering note (2026-11-15, chunk M):** chunk letters drifted at some point (the I-wave landed after L); they now follow list position. Old → new: **J→I, K→J, L→K, I.1–I.8→L.1–L.8, old [M] (deferred QA) → [N], old [I] (polish) → [O]**. Git commit subjects still use the old letters.

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

### [I] Ergonomics update (`core.js` + `app.js` + `index.html` + `css/style.css`, 2026-11-14)
- **I1 Navigation:** `BF.navigate(code, dir)` in `core.js` (left/right ±1, up/down ±16, **rowStart/rowEnd = col 0/15 of current row**, top/bottom, clamps). Wired via shortcuts. 5 tests.
- **I2 Reference glyph:** Shift-click in the sidebar sets/clears `state.ref` (session-only); drawn as a gray underlay in the editor (`drawGlyphTo` gained `opts.color`); gray outline on the ref cell in the selector.
- **I3 Glyph shift:** `BF.shiftGlyph(font, code, dx, dy)` in `core.js` (clips out-of-bounds ink, returns `{clipped, changed}`); `Ctrl/⌘+arrows`; one undo step; toast when ink is clipped. 7 tests.
- **I4 Shortcut registry:** `shortcuts.register({combo, description, handler})` in `app.js`; one global keydown dispatcher (suppressed while an input/textarea has focus; `⌘` = Ctrl; `?` works despite needing Shift). The **reference card** (toolbar `?` button or `?` key) renders from the registry — no drift. All 16 bindings (8 nav + 4 shift + 3 undo/redo + 1 card) registered; old raw keydown removed.
- **I5 Inverted preview:** `pv-inverted` checkbox; `inkColor()`/`bgColor()` helpers; preview glyph/text/atlas surfaces flip to white-on-black; editor + sidebar untouched.
- **I6 Atlas effects:** atlas renders with the current bold/italic/baseline; column spacing `+maxSlant/bold` while on, left pad so left-spill isn't clipped (regression-tested: slanted atlas width).
- **I7 Settings API:** `settingsGet/settingsSet` + `settingsDefaults` table over `bitforge.settings.v1` (type-checked on load, corrupted ⇒ defaults). Persists pvText/pvScale/pvBold/pvItalic/pvBaseline/inverted; controls wired through it. **Rule: new persistable value ⇒ defaults table + API.**
- **Test seam:** `__stub.app = { state, shortcuts, selectGlyph, toggleKeysCard }` (only under the jsc stub) — 7 new headless DOM tests drive the registry and settings. **Total 65 tests.**
- Stub gained a `clearTimeout`/`setTimeout` polyfill (jsc lacks them; `toast()` uses them).
- **Not yet done:** browser visual check (card layout, inverted look, atlas spacing) — user to verify.

### [J] QA update (`core.js` + `app.js` + `index.html` + `css/style.css`, 2026-11-14)
- **J1 Status:** `Font.status` = `Uint8Array(256)` in `BF.makeFont`; persisted in the font blob under key `s` (sanitized on load: only 0/1/2, length 256); absent ⇒ unfinished. `setStatus(code, st)` coerces invalid values.
- **J2 Assignment/display:** Atlas tab left-click selects (geometry-aware `atlasCellAt` using the last `drawAtlas` geo, incl. slanted pad/colW), **right-click opens a floating 3-choice status menu** (browser context menu suppressed). Tints: WIP `#ffe8dd`, unfinished `#eef4ff`, done = plain (dark variants `#3a2a22`/`#20293a` when inverted); atlas + sidebar selector.
- **J3 QA tab (4th):** violations table + **Refresh checks** button + **stale badge**. `state.fontVersion` bumps on every mutation (stroke end, clear, shift, status change; reset per font via `setFont`); report stores its computed version; mismatch ⇒ badge. `qaReset()` on font swap clears the table to the placeholder.
- **J4 Checks (registered data, `qaChecks`):** **duplicate glyphs** (`BF.findDuplicates` — identical-bitmap groups, all-empty group excluded, ink count reported) and **what's left to draw** (`BF.statusCounts` — summary row + one clickable row per unfinished/WIP glyph; clicking jumps to Edit). 9 new core tests + 3 new DOM tests. **Total 77 tests.**
- Seam extended: `setStatus`, `qaRefresh`, `qaRows`, `qaStale`, `atlasCellAt` on `__stub.app`.
- **Not yet done:** browser visual check (tints, menu placement, table look) — user to verify.

### [K] Interop (`core.js` + `app.js` + `index.html` + `test/`, 2026-11-14)
- **K1 BDF import/export (app wiring):** the core `BF.parseBDF`/`BF.toBDF` (DECISIONS #43) landed first with 8 tests in `test/test-bdf.js`. Toolbar **Open BDF** (hidden `#file-bdf`, text read via `file.text()` with a `FileReader` fallback) → `importBdfText(text, name)`: `BF.parseBDF` → `BF.makeFont(w,h)` + data copy → `setFont()` (status/guidelines fresh) + toast; malformed ⇒ error toast with the parser message, current font untouched, returns `false`. **Export BDF** mirrors `exportVerilog`'s download pattern → `bitforge-font.bdf`.
- **K2 Copy glyph to clipboard (DECISIONS #44):** toolbar **Copy glyph** → `glyphCanvas(code, 16)` (offscreen canvas, 16 display px per glyph px, black ink on transparent) → `toBlob` → PNG. `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])` when available (success/failure toasts; a rejected write also falls back to a download); otherwise **PNG download fallback** (`bitforge-glyph-XX.png`) + explanatory toast (covers `file://`).
- **Test seam/stub extensions:** seam gained `importBdfText`, `exportBdf`, `copyGlyph`, `glyphCanvas`, `getLastToast` (toast() now records `lastToast`). The DOM stub gained `navigator`/`ClipboardItem`/`FileReader` globals, a configurable `toBlob` (passes `__stub.blob || null`), and `__stub.setClipboard("available"|"none")` + `__stub.clipboardCalls` (synchronously-settling thenable — no reliance on jsc microtask flushing). See TESTING.md.
- **6 new DOM tests** (BDF import success/malformed, export smoke, glyphCanvas size, clipboard fallback + rasterize-fail toast, clipboard success) → **total 90 tests.**
- **Not yet done:** browser verification — BDF round-trip with a real file, clipboard copy, plus the still-unverified visuals from I & J (keys card layout, inverted preview look, atlas slant spacing, status tints, status menu placement, QA table look). The agent can't screenshot; the user verifies.

### [L.1] File-op & tab keyboard shortcuts (`app.js` + `test/`, 2026-11-14)
User-requested shortcuts for existing features (their list was a weak suggestion; tweaks documented in DECISIONS #48):
- **Registered (11 new, registry total 27):** `Alt+N` new font · `Alt+O` open PNG · `Alt+Shift+O` open BDF · `Ctrl+S` export PNG · `Ctrl+Shift+S` export Verilog · `Alt+Shift+S` export BDF · `E/P/A/Q` show Edit/Preview/Atlas/QA tab · `Ctrl+Q` QA tab + run checks. **Ctrl+N / Ctrl+O became Alt** — the browser reserves them (new window / open file, uninterceptable). BDF shortcuts added for completeness.
- **Registry extended for Alt:** `comboOf` now emits `Alt`/`Alt+Shift` prefixes and, for Alt+letter combos, normalizes the key from layout-independent `evt.code` (`KeyN` → `n`) — because macOS Option+N types `∩` into `evt.key`. The `?` reference card picks all of this up automatically (rendered from the registry).
- **Input suppression** (the user's explicit concern: char-search typing must not trigger shortcuts) — already handled by the dispatcher's `document.activeElement` check; now *tested*: the DOM stub's `activeElement` is a settable property, and a test asserts `q`/`Ctrl+S` are ignored while an INPUT/TEXTAREA has focus and work again after.
- **Tests:** 3 new (comboOf normalization, dispatch of all new bindings end-to-end, input suppression) + the chunk-I registry-count assertion updated 16 → 27. **Total 93 tests.**

### [L.2] Preview markup backslash escapes (`core.js` + `test/` + `index.html`, 2026-11-14)
User request: be able to *type* `*` and `_` in the preview text without toggling formatting.
- `BF.parseMarkup` (pure logic, `core.js` section [3]) now handles backslash escapes: `\*` → literal `*` (0x2A), `\_` → literal `_` (0x5F), `\\` → literal `\` (0x5C); `\uXX` unchanged. Unknown `\x` → literal `\` followed by `x` parsed normally — so a lone/trailing backslash stays a literal (the pre-existing behavior, regression-tested).
- Escapes inherit the current bold/italic flags like any other glyph (e.g. `*\**` → one bold `*`).
- 5 new tests in `test/test-markup.js`; the preview textarea placeholder now mentions the escapes. **Total 98 tests.**

### [L.3] Edit-tab glyph status buttons (`app.js` + `index.html` + `css/style.css` + `test/`, 2026-11-14)
User request: mark the current glyph's status without leaving the Edit tab, for the mark-done-and-move-on workflow.
- Compact `unf` / `wip` / `done` button group in the Edit panel head (`#glyph-status`); active state rendered as an inverted (black) button. Clicking marks the **current** glyph via the existing `setStatus()` — same code path as the Atlas-tab right-click menu, so persistence, tints, QA staleness and the buttons can't drift apart.
- `renderGlyphStatus()` highlights the selected glyph's state; called from `setStatus`, `selectGlyph`, and `redrawAll` (covers font swap/import). Re-clicking the active state is a deliberate no-op (no font-version bump, so no false QA staleness).
- **Stub improvement:** the DOM stub's `classList` now actually tracks classes (`toggle`/`add`/`remove`/`contains`) so tests can assert active states (it was a no-op before).
- 1 new DOM test covering set-via-button, selection following, no-op click, and atlas-path sync. **Total 99 tests.**

### [L.4] Menu bar (`index.html` + `css/style.css` + `app.js` + `test/`, 2026-11-14)
User request: a desktop-app-style menu bar instead of a row of toolbar buttons.
- **File**: New font · Open PNG · Open BDF · **Export PNG (solid bg)** · **Export PNG (transparent bg)** · Export BDF · Export Verilog. **Edit**: Undo · Redo · Clear glyph · Copy glyph to clipboard. Menu items show their keyboard-shortcut hints (static text, matching the registry).
- **Behavior:** click a title to open/toggle; hover another title while one is open to switch; outside `mousedown` or `Escape` closes; an item click runs its action and closes. Mouse-only by design (every action already has a keyboard shortcut; the two document-level close listeners are no-ops under the jsc stub — browser-verified).
- **PNG background:** the toolbar checkbox is gone. `exportPng(bgMode?)` — the menu items pass `"solid"`/`"transparent"`, which is remembered via the settings API as **`pngBg`** (default `"solid"`, added to `settingsDefaults`); a bare call (**Ctrl+S**) exports with the remembered mode.
- **Removed from the toolbar:** all per-action buttons + the checkbox; the hidden `#file-png`/`#file-bdf` inputs stay (file pickers). `clearGlyphAction()` extracted so the Edit-tab button and the Edit-menu item share one implementation. No new `querySelectorAll` (menus tracked in an `menuEls` array — stub stays unchanged).
- **Tests:** 2 new DOM tests (open/switch/hover/toggle/item-click-closes with a real action; `pngBg` remembering incl. bare-call behavior) via `__stub.dispatch` on `mb-*`/`mi-*` elements (the stub's real `classList` tracking from [L.3] makes the assertions possible). Seam gained `exportPng`, `settingsGet`, `settingsSet`. **Total 101 tests.**

### [L.5] Atlas render controls (`index.html` + `app.js` + `test/`, 2026-11-14)
User request: the Atlas already honors bold/italic/baseline/inverted, but changing them required switching to Preview.
- Atlas panel head gains its own **bold / italic / baseline / inverted** controls (`at-*` ids). They drive the **same state and same settings entries** as Preview (no new settings keys); scale stays Preview-only.
- **Shared setters** `setBold/setItalic/setInverted/setBaseline` (write state + settings, redraw) + `syncRenderControls()` which pushes current values into **both** control sets — called from every setter, `setFont` (baseline `max` follows the font height), so neither set can show a stale value. The old inline pv-* handlers were replaced by these.
- **Bug found & fixed during the chunk:** a premature `syncRenderControls()` call at the end of `init()` (before `setFont`) crashed under the stub with `state.font` still null — 12 test failures immediately exposed it. Removed the call (`setFont` already syncs) and hardened the guard to `if (!el.pvBold || !state.font) return;`. This is why the headless DOM smoke test exists.
- 1 new DOM test (both sync directions for checkbox + number input, incl. baseline clamping to font height). **Total 102 tests.**

### [L.6] Preview layout + destructive-action styling (`index.html` + `css/style.css` + `app.js`, 2026-11-14)
User request: stack the markup input and its rendered sample vertically, and drop the single-glyph zoom ("maybe even remove it… it can already be previewed in other ways").
- Preview panel is now just: controls row (scale/bold/italic/baseline/inverted) → `<textarea>` → rendered canvas (`.textcol` fills the panel). The `.preview-grid` two-column layout and the `#pv-glyph` canvas are gone.
- **`drawPvGlyph()` deleted** along with all its call sites (redrawAll, selectGlyph, pv-scale, the four shared setters) — grep-verified no references remain. The Edit tab (large glyph + guides) and the text sample (bold/slant at any scale) cover the removed surface.
- **Clear glyph** (Edit-tab button) gets `button.btn-danger`: a subtle reddish border/text to signal a destructive (but undoable) action.
- No test-count change (layout/styling; the init smoke test still passes with the new structure). **Total 102 tests.**

### [L.7] Status pumping shortcuts (`app.js` + `index.html` + `test/`, 2026-11-14)
User request (suggested key scheme, tweaks OK): cycle the selected glyph's status, and a Shift variant that marks done + advances — for pumping a large batch of glyphs.
- **`D`** = `cycleStatusAction()` — cycles unf → wip → done → unf via `setStatus` (buttons/tints/QA staleness all follow). **`Shift+D`** = `doneNextAction()` — marks done (no-op if already done) then `selectGlyph(code+1)`, **clamped at 0xFF with a toast** (deliberate no-wrap: a pumping session must not jump back to 0x00).
- Both registered in the shortcut registry (keys card shows them; registry total now **29**) and mirrored as Edit-menu items (**Cycle glyph status / Mark done & next**).
- 1 new DOM test (full cycle wrap, done+advance, 0xFF clamp + toast, Edit-menu items, status buttons following). The registry-count assertion moved 27 → 29. **Total 103 tests.**

### [L.8] About menu + modal, W/H indicator removed (`index.html` + `css/style.css` + `app.js` + `test/`, 2026-11-14)
User request: drop the `W:8 H:16` corner readout (dims are obvious), add an About menu with the font info, and an About modal for app purpose/authorship.
- **Removed:** `#dims` from the toolbar, `el.dims`, `updateDims()` + its call in `redrawAll`, the `#dims` CSS rule, and the init-test assertion on it.
- **About menu** (third menu, after Edit): a non-interactive `.mi-info` line, re-rendered on **each open** by `renderAboutInfo()` (`W × H px · 256 glyphs · N ink px` + `done/wip/unfinished` counts via `BF.statusCounts`/`BF.inkCount` — the dims info effectively moved here), plus an **About bitforge…** item.
- **Modal:** `#about-modal` fixed backdrop + centered `.modal` (purpose, feature list, "Built by spacecat · vanilla JS, zero dependencies, runs straight from file://"). Closes via the × button, backdrop mousedown (`e.target === backdrop`), or Escape (the existing document Escape handler now also closes it). Menu wiring was refactored to a `showMenu()` used by both click-toggle and hover-switch (it's where the on-open info refresh hooks in).
- **CSS gotcha:** the backdrop's `display: flex` overrides the UA `[hidden]` rule, so `.modal-backdrop[hidden] { display: none }` is explicit.
- 1 new DOM test (info content incl. live dims/ink/status, menu→modal flow, × close) + the dims assertion removed from the init test.
- **Browser-verified bug found & fixed (user report, 2026-11-14): every menu item was dead in the real browser.** The outside-close handler was a `document` *mousedown* listener whose "inside" check only knew the menu container and title — a mousedown on an **item** closed the menu before the item's `click` could fire, and the browser swallows the click when the element is hidden between mousedown and mouseup. Symptom: clicking "About bitforge…" (or any item) did nothing, no console error. The headless suite missed it because the stub ignored document-level listeners. Fix: `menuContains()` walks up from `e.target` via `parentElement`, so items count as inside; the stub now stores named document listeners and exposes `__stub.docDispatch(name, evt)` (tests set the target's `parentElement` chain by hand), and a regression test reproduces the real mousedown→(hidden)→click sequence. Escape/backdrop close paths are now testable through `docDispatch` too. **Total 105 tests.**

### [M] About contents + versioning; chunk letters normalized (`core.js` + `index.html` + `app.js` + `test/` + `docs/`, 2026-11-15)
User requests: (1) flesh out the About modal — drop the FPGA-terminal framing, credit the design (spacecat) vs the coding (Qwen 3.8 in the Bionic harness) properly; (2) a visible version number (0.x.y, assigned retrospectively from the Current-state list); (3) clean up the drifted chunk letters ("just change the reference letters").
- **Versioning (DECISIONS #56):** `BF.VERSION = "0.13.0"` in `core.js` (new `BF` export) — 0.MINOR.PATCH, MINOR = position in the Current-state list, PATCH = wave sub-index; the retrospective table is in the Versions section above. Stamped at init into `#about-title` (modal head) and `document.title`. A new headless test pins the exact value (format + 0.13.0), so a silent bump fails the suite.
- **About modal (DECISIONS #57):** purpose is now "a **bitmap font editor** for fixed-size, zero-spacing, non-proportional monospaced fonts — 256 glyphs per face, cell size of your choosing (default 8×16)" — FPGA framing gone from all user-facing text (README updated to match; its stale "45 tests" count → 106). Credit line per the user's pick (variant A): "Designed by spacecat · Coded by Qwen 3.8 (Bionic harness) · vanilla JS, zero dependencies, runs straight from file://". If the harness model ever changes, update the name in the modal — the role framing is the durable part.
- **Letter normalization (DECISIONS #58):** this file, DECISIONS.md, TESTING.md and one `app.js` comment re-lettered J→I, K→J, L→K, I.x→L.x; the open items are now [N] deferred QA and [O] polish (the checklist lists both, keeping the list the single source of positions). Prose untouched — reference letters only; old letters remain in git commit subjects.
- 1 new headless test (version pin + modal head + tab title). **Total 106 tests.**
- **Browser-verify (user):** modal text/credit, tab title, no visual regressions.

### [N.1] QA severity + silencing (`core.js` + `app.js` + `index.html` + `css/style.css` + `test/`, 2026-11-15)
User request (part of [N]): a per-glyph *silencing* so expected violations (box-drawing chars touching cell edges) don't raise warnings, plus per-check status icons. All open decisions were settled before implementation: both QA checks will be built (N.2/N.3), **icon set C** (green check / grey i / red triangle / grey slashed circle), terminology "silenced", duplicates stay non-silenceable.
- **Severities + icons:** checks now declare `severity` + `silenceable`; `qaIcon(kind)` renders the set-C inline SVGs (ok #2e7d32 / info #888888 / warn #cc3333 / sil #999999). A **summary strip** (`#qa-summary`) shows one line per check: worst *active* severity icon (ok when clean, silenced when all silenced) + count + "(N silenced)". Each row gets its icon in the check cell.
- **Silencing:** `font.silences = { checkId: { code: true } }` (new `BF.makeFont` field), blob key `si`, sanitized on load against the known check ids (derived from `qaChecks` — no second literal list). "silence"/"un-silence" buttons in a new 4th table column (silenceable per-glyph rows only); silenced rows hidden by default, muted (`tr.qa-sil`), revealed by the **show-silenced** checkbox (`qaShowSilenced`, settings API). Toggling = font mutation → stale badge + immediate re-render.
- **Bug found by the new test:** row icons passed the severity string ("warning") straight into `qaIcon`, whose kinds are `"warn"` — silently falling back to the info icon. Normalized at the call site; the regression is pinned by the icon-color assertions.
- **Stub extended:** elements now track **real children** (`appendChild`/`insertBefore`/`removeChild`, `children`/`firstChild`) and setting `innerHTML` clears them (real DOM semantics) — tests inspect rendered QA rows directly. Seam gained `toggleSilence`, `qaChecks` (a test pushes a temporary stand-in silenceable check and pops it).
- 3 new tests (silences field, summary strip, full silence→persist→reveal→un-silence cycle). **Total 109 tests.**
- **Browser-verify (user):** summary strip + icons, silence buttons, show-silenced toggle, muted rows.

### [N.2] Edge-ink QA (`core.js` + `app.js` + `test/`, 2026-11-15)
First of the two greenlit QA checks (implements the long-deferred DECISIONS #46): flag glyphs whose ink touches the outermost cell row/col — at zero letter spacing that ink collides with the neighbour.
- **`BF.edgeInk(font, code)`** (core.js section [10], DOM-free): touched edges as a subset of `["top","bottom","left","right"]` (top = row 0, bottom = row H-1, left = col 0, right = col W-1); blank glyph → `[]`; a 1px-wide font lets one pixel touch left+right (or all four).
- **Check "edge-ink"** (`qaChecks` in app.js): severity **warning**, **silenceable** — box-drawing/pseudo-graphics that touch edges by design get silenced per glyph via the N.1 machinery. Detail: "ink touches the top + bottom edges" (one row per glyph, clickable).
- 5 core tests (blank, corner pixels, interior-vs-edge, all-four, degenerate 1px-wide, out-of-range) + 1 DOM test (crafted glyph → row with named edges; silence → hidden + summary count + blob persistence; un-silence). **Total 115 tests.**
- **Browser-verify (user):** edge-ink rows in the QA table, its silence button, summary icon.

### [N.3] Guideline-violation QA (`core.js` + `app.js` + `test/`, 2026-11-15)
Second (and last) greenlit QA check (implements the long-deferred DECISIONS #47): flag glyphs whose ink crosses the font's bound guides.
- **Label-aware bounds** (user's pick over a min/max bounding box — a lone baseline guide must never collapse bounds to a line; reference guides must never be bounds): only guides labelled `asc`/`desc`/`L`/`R` count. `BF.GUIDE_BOUND_LABELS` (core.js section [11]) owns the four labels — `GUIDE_PRESETS` in app.js references it (single source of truth; label strings unchanged, so saved fonts keep working).
- **`BF.guideBounds(font)`**: topmost ascender / lowest descender / leftmost L / rightmost R → `{ off, label }` or null per side (outermost wins on duplicate labels). **`BF.guideViolations(font, code)`**: `[{ bound, label, over }]` — over = overshoot in px; ink exactly on a bound line is fine; blank glyphs / missing bounds ⇒ nothing.
- **Check "guideline violations"** (`qaChecks`): severity **warning**, **silenceable**; one row per glyph; the detail names the crossed guide by its chip label + overshoot: `ink 2px above the "asc" guide; 1px right of the "R" guide`.
- 6 core tests (bound selection, reference-only guides, outermost-wins, on-line ink, label+overshoot report, blank/no-guards) + 1 DOM test (crafted glyph → named guides in the detail, silence/un-silence). **Total 122 tests.**
- **Browser-verify (user):** guideline rows + guide names in the detail, silence buttons, summary icon.

### [O.1] Preview control cleanup (`index.html` + `js/app.js` + `css/style.css` + `test/`, 2026-11-15)
User report: the Preview tab's bold/italic checkboxes do nothing (they orphaned when the single-glyph zoom render was removed in [L.6] — `drawPvText()` is markup-driven and never reads `state.bold`/`state.italic`; only `drawAtlas()` consumes them). See DECISIONS #62.
- **Removed** the `pv-bold`/`pv-italic` inputs, their el-table entries and change bindings. **Bold/italic now live on the Atlas tab only** (unchanged behaviour — they still drive the shared `state.bold`/`state.italic`). Preview keeps scale/baseline/inverted. `syncRenderControls()`'s early-return guard now keys off `el.pvInverted`. Settings keys `pvBold`/`pvItalic` deliberately kept (Atlas depends on them).
- **Added** a muted markup note between the Preview textarea and its render canvas: `markup: *bold* · _italic_ · \uXX unprintables · \ escapes (\* \_ \\)`, so the Preview's markup-driven per-glyph attributes are documented in place.
- **Fixed** the now-stale "Shared with the Preview tab" titles on the Atlas bold/italic labels (only baseline/inverted are shared).
- Tests: settings-persistence test now drives `at-bold`; the two slant-geometry atlas tests drive `at-italic`; the L.5 mirror test renamed + reshaped (atlas→state for bold/italic; two-way mirror kept for inverted/baseline). **Total 122 tests.**
- **Browser-verify (user):** no bold/italic on the Preview tab; the markup note is visible; Atlas bold/italic still work.

### [O.2] Preview newline fix (`js/core.js` + `js/app.js` + `test/`, 2026-11-15)
User report (a bug present since the first preview implementation): a single `\n` in the Preview textbox rendered no line break at all, `\n\n` rendered one, and newlines reset the `*bold*`/`_italic_` state. See DECISIONS #63.
- **Root cause:** `drawPvText()` parsed each raw line separately and packed items into display rows by appending to the last row while it had space — a new row only started on `maxCols` overflow, so newline boundaries were lost (N newlines → N−1 breaks, blank lines swallowed) and per-line parsing reset markup state at every `\n`.
- **Fix:** `BF.parseMarkup` emits a break token `{ code: -1, ok: true, nl: true }` per `\n` (state carried across — core.js, DOM-free); `drawPvText()` parses the whole text once and starts a new display row at every `nl` item (blank lines kept; `maxCols` soft-wrap unchanged). `*AAA⏎AAA*` now renders both lines bold.
- 3 core tests (break token shape, state spanning, consecutive breaks) + 1 DOM test (canvas height: 1 line vs 1 `\n` vs `\n\n` — the regression for the exact reported symptom). **Total 126 tests.**
- **Browser-verify (user):** the two examples from the bug report — `AAA⏎AAA` now breaks; `AAA⏎⏎AAA` shows a blank line between; bold across a line break.

### [O.3] Project file (.bitforge) (`js/core.js` + `js/app.js` + `index.html` + `test/`, 2026-11-15)
User re-opened DECISIONS #1/#25 ("no project file"): PNG stays primary for finalized fonts, but a WIP-snapshot project file should carry everything the app persists. See DECISIONS #64.
- **Format:** `.bitforge` = JSON `{ app: "bitforge", kind: "font-project", version: 1, font: {w,h,d,g,s,si}, settings: {...} }`. `font` is the exact localStorage blob shape; `settings` optional on import (missing → keep current; unknown keys dropped; same per-key type rules as the settings loader). This build reads `version === 1` only — newer/foreign files are rejected with a named error toast.
- **No second serializer:** the blob shape + all sanitizing moved to core.js — `BF.fontToBlob` / `BF.fontFromBlob(obj, knownCheckIds)` (plus the `projectToObj`/`objFromProject` wrapper). localStorage restore, export, and import all share it. Deliberate relaxation: a blob missing `d` restores as a blank font at the saved dims (was: failed to a fresh 8×16).
- **UI:** File → **Open project…** (`Alt+P`) / **Export project…** (`Alt+Shift+P`, `font-WxH.bitforge`). Import = confirm (it replaces font **and** settings) → `setFont` → `applyImportedSettings` (same settings→state+controls restore path as init) → toast. New stub: `confirm()` (defaults yes; `__stub.setConfirm(false)` simulates cancel) + cancel-path test.
- 7 core tests (blob roundtrip, sanitizing, no-check-list, wrapper shape, JSON roundtrip, rejection reasons, optional settings) + 2 DOM tests (full export→import roundtrip incl. settings + cancel no-op; malformed-file toasts). Shortcut registry count 29 → 31. **Total 135 tests.**
- **Browser-verify (user):** File-menu items + shortcuts, the confirm dialog, export/import roundtrip with a real file, error toast on a foreign file.

### [O.4] Bound-guide off-by-one fix (`js/core.js` + `js/app.js` + `test/`, 2026-11-15/16)
User report ×2: asc/L guideline violations were flagged, but desc/R "never show up" (and the first fix attempt didn't resolve it). See DECISIONS #65.
- **First attempt (misdiagnosis, reverted):** moved the `descender`/`right` presets from `h-1`/`w-1` to `h-2`/`w-2` on the theory that a bound on the cell edge "can never fire". The user's follow-up showed the real symptom: with R at 6 (line visually between cols 6|7, 1-based) the edge pixel still needed the line one pixel further in.
- **True root cause (user's diagnosis):** guide lines render on grid boundaries — **between** pixels (canvas `off*scale + 0.5`), never on a pixel. `BF.guideViolations` was written for on-pixel line semantics: bottom/right used `maxR > off` / `maxC > off`, so the pixel at index `off` — the first pixel below/right of the line — was never flagged. Top/left (`minR < off` / `minC < off`) were already correct, which is exactly why asc/L worked and desc/R didn't.
- **Fix:** bottom/right now use `maxR >= off` / `maxC >= off`; overshoot counts pixel rows/cols outside the line (`maxR - off + 1`). Presets **reverted** to the original `h-1`/`w-1` — under the fixed comparison each line leaves exactly 1px outside (row `h-1` / col `w-1`), same as asc/L. Existing fonts' saved guide positions are unaffected by either change.
- Tests: core now covers all four directions (bottom+left added in the first attempt; bottom/right overshoot assertions updated to the between-pixels semantics, e.g. R line at boundary 5 + ink in col 7 = 3px right) + a DOM test pinning the preset positions via the `guidePresets` seam export. **Total 137 tests.**
- **Browser-verify (user):** with the default desc/R presets, ink on the bottom row / right column now raises a QA row, and the line visually sits between the last two rows/cols (1px outside = flagged).

### [O.5] Clipboard PNG atlas (`js/app.js` + `index.html` + `test/`, 2026-11-16)
User request: export the whole font PNG to the clipboard, and import it back from the clipboard. See DECISIONS #66.
- **Copy PNG to clipboard** (File menu, `Alt+Shift+C`): the atlas-canvas builder was extracted from `exportPng` into `atlasCanvas()` (shared with file export; remembered `pngBg` background) and written as an `image/png` ClipboardItem. Same fallback as the single-glyph copy: download `bitforge-atlas.png` when the clipboard API is unavailable or the write is blocked.
- **Import PNG from clipboard** (File menu, no shortcut): `navigator.clipboard.read()` → first `image/png` entry → the **shared** `pngBlobToFont()` blob→Image→`importPngImage` path (file import now uses the same helper too — `onPngFile` just hands its File to it). Unavailable API / denial / no-PNG-on-clipboard all toast. **Deliberately no Ctrl+V:** PNG import replaces the font without a confirm, so a stray paste must not nuke current work (documented in the code + DECISIONS #66).
- Stub's clipboard gained `read()` (fed by `__stub.clipboardRead`, rejectable via `__stub.clipboardReadError`). 2 new DOM tests (write + download fallback; the three error paths). The success path is browser-verified (image decode can't run under jsc — same limitation as file PNG import). **Total 139 tests.**
- **Browser-verify (user):** copy → paste into an image tool; copy a known atlas PNG in the OS → Import PNG from clipboard.

### [O.6] Reference-glyph hint (`index.html` + `css/style.css` + `js/core.js` + `test/`, 2026-11-16)
User request: surface the reference-character (Shift-click) selection somewhere in the character-selection panel — mouseover text on the panel and/or under it. See DECISIONS #67.
- Both options, cheaply: a muted **caption under the selector canvas** (`#sel-hint`: `Click: select · Shift-click: reference glyph (underlay in Edit tab)`) plus the **canvas `title` tooltip** expanded to the full sentence (including that Shift-click again clears it). The caption is always visible (tooltips need a hover pause, so the caption carries the discoverability); the tooltip carries the extra detail.
- Static HTML + one CSS rule (`.sel-hint`: 11px, `var(--muted)`); no behavior change. **No test-count change** — DOM-only, init smoke still passes. The stub does not parse `index.html`, so static HTML text isn't testable headlessly (same category as [L.6]/[O.1]). **Total 139 tests.**
- **Browser-verify (user):** caption visible under the atlas grid; tooltip on hover mentions Shift-click.

### [O.7] Docs reorg — root README.md + AGENTS.md (`README.md` + `AGENTS.md` + `docs/`, 2026-11-16)
User request: make the project "worthy of github" — move the agent-facing material to AGENTS.md and rework the README to be user/developer-facing. See DECISIONS #68.
- **New root `README.md`** (so GitHub renders it): what it is, features, getting started (real menu labels), the four file formats (PNG / Verilog / BDF / .bitforge), the preview markup table, a developer section (layout + running the tests), doc pointers, and the About-modal credit line. Deliberately does **not** duplicate the shortcut list — the in-app `?` reference card renders from the live registry (DECISIONS #35), so a README copy would drift.
- **New root `AGENTS.md`**: the agent entry point — read order (DECISIONS → DESIGN → STATUS; TESTING before core.js work), hard constraints, the test gotchas (version pin, shortcut-count assertion, cross-test state bleed, stub not parsing `index.html`), the per-chunk ritual, and the standing conventions (`shortcuts.register`, the settings API, the `qaChecks` list).
- **`docs/README.md` deleted** — its content fully redistributed (user-facing → root README, agent-facing → AGENTS.md). Nothing linked to it (grep-verified).
- Version bumped to 0.15.7 to keep the Versions table 1:1 with the Current-state list even for this docs-only change (DECISIONS #56 is mechanical: new chunk ⇒ bump + pin update).
- **Total 139 tests.**
- **Browser-verify (user):** nothing beyond the About modal / tab title now showing 0.15.7.

### [O.8] Screenshot + MIT license (`docs/screenshot.png` + `LICENSE` + `README.md` + `docs/`, 2026-11-16)
User request: wire the user-provided screenshot (placed at the workspace root) into the README as suggested, and license the project under **MIT**. See DECISIONS #69.
- **Screenshot:** moved `screenshot.png` (1996×1224 full-window capture) to `docs/screenshot.png` (the user's suggested spot; it sits beside the handover docs — if more images accumulate, a dedicated `images/` folder would be the move) and placed it in the README as the **hero image** under the intro paragraph. Layout-tree comment updated.
- **License:** new root `LICENSE` — full MIT text, copyright line `Copyright (c) 2026 spacecat` (holder confirmed by the user). README gains a one-line **License** section linking to `LICENSE`, plus a `LICENSE` row in the layout tree. No version bump for the license choice itself (no app change; user instruction).
- Version bumped to 0.15.8 (mechanical, DECISIONS #56 — assets/docs-only change). **Total 139 tests.**
- **Browser-verify (user):** the hero image renders and sizes sanely in a markdown previewer (or GitHub).

### [P] Font name + Properties modal (`js/core.js` + `js/app.js` + `index.html` + `css/style.css` + `test/`, 2026-11-16)
User request (greenlit with [Q]): the font name wired into the exports, editable from the app — **Edit → Properties…** (name + basic font info/metadata). See DECISIONS #70.
- **Model (core):** `font.name` (default `"font"`), `BF.sanitizeFontName` (printable ASCII, ≤ 64, trimmed), `BF.filenameBase` (empty → `font`); blob key `n` (missing/invalid → default; the `.bitforge` format **stays version 1** — additive optional field, pre-1.0); the BDF `FONT`/`FAMILY` header carries the name (quotes dropped; fallback `bitforge`); `parseBDF` reads the `FONT` line into `p.name` (`"FONT "` prefix can't collide with FONTBOUNDBOX/ADD_FONT).
- **Exports wired:** every download filename is now `filenameBase(name) + ext` — `.png` (file export + clipboard fallbacks), `.mem`, `.bdf`, `.bitforge` (the project file drops the old `font-WxH` prefix).
- **Imports derive the name:** PNG file → the file's basename; BDF → its own `FONT` line wins, else the file's basename; project file → the blob's `n`; **clipboard PNG → default** (no source filename to derive from). The import toast shows `as "name"` when a name was derived.
- **UI:** Edit → **Properties…** (no shortcut) modal — editable name + a live info line **shared with the About menu** (extracted `fontInfoText()`; the About-menu info now leads with the font name). Same close paths as the About modal (× / Cancel / backdrop / Escape). A name change is `saveLS()` only — metadata, not a mutation (no QA staleness bump, not undoable).
- **Stub:** `downloadBlob`'s `a.click()` now records the filename into `__stub.downloads`; the seam gained `exportProject`.
- 7 new tests (1 model default + 3 name/blob core + 2 BDF + 1 DOM modal/filenames/persistence). Two test-side bugs fixed on first run (my BDF fixture lacked BW/DH; wrong expectation for the precomposed `é`). **Total 146 tests.**
- **Browser-verify (user):** Edit → Properties (name roundtrip + info line); exports download with the name; a PNG/BDF import picks up the name from the filename.

### [Q] Cell resize (`js/core.js` + `js/app.js` + `index.html` + `css/style.css` + `test/`, 2026-11-16)
User request (greenlit with [P]): crop/extend the character size by one or more pixels **in a specified direction** (8×16 → 9×16 or 6×12) — choosing the edge is crucial, and the guides must shift so they stay in place relative to the existing content. See DECISIONS #71.
- **Core (new section [13]):** `BF.resizeFont(font, { dTop, dBottom, dLeft, dRight })` → `{ font, inkClipped }` — a **new** font object (input untouched). Ink (x, y) → (x + dLeft, y + dTop): extending left/top pushes content down/right; extending right/bottom leaves it in place. New dims validated 1..1024 (throws otherwise; fractional/string deltas throw too). **Guidelines shift with the content** (h: `off += dTop`, v: `off += dLeft`) and clamp to `[0, newDim]` (a guide clamped to the far edge is the least-surprising rest). Name/status/silences survive (per-code, not per-pixel). `BF.cloneFont` (deep copy) added for undo snapshots.
- **Undo:** the history gained a second entry shape — full-font `{ full: snapshot }` alongside the per-glyph `{ code, snap }`; undo/redo handle both; snapshots are cloned so the history never aliases the live font.
- **UI:** Edit → **Resize…** modal — four per-edge delta inputs (any integer; positive adds, negative removes), a live `→ newW×newH` readout (validity reuses `BF.validateDims`), and the **clip warning**: when a crop would drop ink, the first Apply shows "N px of ink will be clipped — click Apply again to confirm" and arms a confirming second click. Apply = one full-font undo step + the normal mutation flow (staleness bump + saveLS + clip toast); the **slant baseline** (app state) also shifts by `dTop` (clamped).
- 10 new tests (8 core: extend right/left/top, per-edge crops, all-four-edges crop counted once, guide clamping, validation, meta-survival + clone independence; 2 DOM: modal flow + live readout + undo; clip-warning arm/confirm + undo). **Total 156 tests.**
- **Browser-verify (user):** the Resize modal — extend/crop per direction, guides staying put relative to the content, the clip warning + second click, undo.

### [Q.1] Clip warning lists affected glyphs (`js/core.js` + `js/app.js` + `test/`, 2026-11-17)
User request: the clip warning should list the characters/codepoints a lossy crop affects, not just a pixel count — so the user can check the affected glyphs instead of scrambling through the atlas. See DECISIONS #72.
- **Core:** `BF.resizeFont` additionally returns **`clippedCodes`** — ascending, each code once (a glyph losing several pixels is listed once).
- **UI:** the confirm warning now reads `N px of ink will be clipped on M glyphs: 0x41 · A, 0x07, 0x5C — click Apply again to confirm`. Labels use the app's `hex · char` convention (printable char for `0x20`–`0x7E` only); the **full** list is shown with the **count M** of affected glyphs (the original cap-at-16 was rejected by the user the same day — see DECISIONS #72). The post-apply toast keeps the short pixel count.
- 2 new core tests (list content + ordering + empty; dedupe). **Total 158 tests.**
- **Browser-verify (user):** a crop that clips ink lists the right glyphs in the warning.

### [R] Changelog + what's-new modal (`js/changelog.js` + `CHANGELOG.md` + `js/core.js` + `js/app.js` + `index.html` + `css/style.css` + `test/`, 2026-11-17)
User request: a changelog (machine-readable for the app, readable for the repo) and a modal on version bumps showing what changed since the user's last run — semver-aware, with an option for the whole changelog; also viewable on demand from the About dropdown. See DECISIONS #73.
- **Data:** new `js/changelog.js` — `BF_CHANGELOG`, newest first, `{ version, date, changes: [...] }`, **backfilled for every released version 0.1.0 → 0.18.0** (dates from the status log; the early A–F entries are undated). `CHANGELOG.md` is the human-readable mirror; both updated in the same commit as a version bump (now part of the per-chunk ritual; a data-sanity test enforces the shape + that the newest entry matches `BF.VERSION`).
- **Core (new section [14]):** `BF.cmpVersions(a, b)` (semver-ish triple compare, lenient: invalid component ⇒ 0) + `BF.changelogSince(changelog, lastVersion)` (entries strictly newer than lastVersion; null/empty/invalid ⇒ all; same-or-newer ⇒ []).
- **App:** last-run version in `localStorage` key `bitforge.version.v1` (deliberately *not* the settings blob — app metadata, never in the project file). Startup: read stored → `whatsNew()` → refresh stored to current → if anything is new, open the modal in **what's-new mode** (title “What's new in bitforge X”, only the new entries, a **Full changelog…** switch, OK). About → **Changelog…** opens **full mode** (title “bitforge changelog”, all entries, Close). One modal (`#cl-modal`), scrollable body (`.modal-scroll`, 60vh); standard close paths (× / OK / backdrop / Escape). First run (no stored version) = full changelog in what's-new mode; a downgrade (stored newer) shows nothing.
- 4 new tests (3 core: cmpVersions, changelogSince, data sanity; 1 DOM: version remembered, filtering from 0.16.0 and a downgrade, both modal views + the full-list switch). **Total 162 tests.**
- **Fixed before user verification (same 0.18.0):** the first commit forgot the `<script src="js/changelog.js">` tag in `index.html` — the headless suite can't catch that (run.js loads the file itself; the stub doesn't parse index.html), so it only showed as a browser `ReferenceError` on user verification. Gotcha recorded in AGENTS.md (new .js file ⇒ script tag + run.js load, both).
- **Browser-verify (user):** the modal on first run / after a bump (clear the localStorage key, or run an old build then this one); the switch to the full list; About → Changelog…; scroll behaviour.

### [S] Glyph-manipulation tools (`js/core.js` + `js/app.js` + `index.html` + `test/`, 2026-11-18)
User greenlight (2026-11-18): the three small editing primitives — copy a glyph to another codepoint, mirror the current glyph, and a QA check for accidentally-empty printable glyphs. See DECISIONS #74.
- **Core (new section [15]):** `BF.copyGlyphTo(font, from, to)` (whole-bitmap copy; no-op when equal; throws on bad codes; status/silences untouched) · `BF.mirrorGlyph(font, code, axis)` (in-place swap, axis `"h"` = left↔right, `"v"` = up↔down; works for odd and even dims) · `BF.emptyPrintables(font)` (ascending `0x21`–`0x7E` with zero ink; space exempt).
- **App:** Edit menu gains **Mirror left–right** (H) · **Mirror up–down** (V) · **Copy to codepoint…** (C) between Clear glyph and the status group. `parseCodeInput()` extracted from the jump field (one char, or 1–2 hex digits with/without `0x`) and shared with the copy-to prompt. Copy-to **selects the target afterwards** (shaping the new variant is the usual next step); refuses same-codepoint, garbage, and cancel with distinct toasts. Both mirror and copy-to are one per-glyph undo step each. New QA check `empty` (info, silenceable per glyph; detail gains “— marked done” when the status is done — the real mistake). Shortcuts H/V/C registered (count 32→35).
- 7 new tests (3 core in `test/test-glyphops.js`; 4 DOM: parseCodeInput, mirror + undo×2, copy-to incl. refusal paths + target-selection + status-survival, the empty check incl. done-detail + silence + space-exempt). The [R] changelog-filtering DOM test was made version-independent (computed from `BF_CHANGELOG` + `BF.cmpVersions`) so it survives bumps. **Total 169 tests.**
- **Browser-verify (user):** mirror both axes on an asymmetric glyph (e.g. draw a `>` and mirror H → `<`); Copy to codepoint… (prompt, target selection, undo); QA tab — the empty-printable rows, the “marked done” detail, silencing one.

### [T] Editor toolbar + selection tools (`js/core.js` + `js/app.js` + `index.html` + `css/style.css` + `test/`, 2026-11-18)
User greenlight (2026-11-18, incl. the toolbar idea): the selection toolset as its own chunk, with a proper toolbar as its home. See DECISIONS #75.
- **Core (new section [16]):** `BF.normRect` (any-corner-order → clamped `{x,y,w,h}`, a point yields 1×1 — click-vs-drag is the app's job) · `BF.rectFill(font, code, rect, 0|1)` · `BF.rectInvert` · `BF.rectMove(font, code, rect, dx, dy)` (cut: source cleared, content placed, off-cell clipped; overlap-safe via snapshot; → `{moved, clipped}`) · `BF.rectCopy(font, from, to, rect)` (exact pixels at the same position — a paste, not a stamp).
- **Toolbar (Edit tab, above the guidelines bar):** tools group **paint** (B; the default) · **erase** (no key — E is the Edit tab) · **select** (S); contextual selection group (only while a selection is active): **fill** (F) · **clear** (X) · **invert** (I) · **copy** (clipboard PNG ×16, transparent — the Copy-glyph pipeline, now shared via `copyCanvasToClipboard`) · **copy to…** (prompt → `BF.rectCopy`, target becomes the selection) · **×** — plus a `w×h` readout.
- **Interaction:** in select mode, drag = marquee (clamped to the cell), plain click = deselect, drag starting *inside* the selection = move (the marquee previews the landing spot; release commits one undo step; the selection follows its content). Right-drag/Shift-drag still erase in paint mode; the erase tool erases with the left button. **Esc deselects** — but only when no menu/modal is open (they keep priority; the handler checks them first). Switching glyph or away from the select tool clears the selection. Selection is UI-only (never persisted).
- **UI details:** the marquee/selection renders as a dashed blue rect + 10% tint over the editor (drawn last, so it's always visible); the selection group reuses the status-button visual language (`.tools` CSS).
- 8 new tests (4 core in `test/test-selectops.js`: normRect, fill/invert, move incl. overlap+clipping+no-op, rectCopy; 4 DOM: tool switching + bar + per-glyph clearing, fill/invert/clear + undo×3, copy-to incl. exact-paste + status-survival + target-selection + undo, Esc-deselect). The stub ctx gained no-op `save`/`restore`/`setLineDash`. **Total 177 tests.**
- **Browser-verify (user):** draw a few pixels, `S`, drag a marquee (dashed overlay + `w×h` readout), fill/invert/clear, drag the selection to move its contents (source clears, clipped at the edge — toast reports it), copy to clipboard, copy to…, Esc, and the toolbar's active states.

### [T.1] Toolbar polish (`index.html` + `css/style.css` + `js/app.js` + `test/`, 2026-11-18)
User feedback on [T] (2026-11-18): the selection actions should only be visible when usable; reuse the toolbar's right side as a context area; move the toolbar below the guides bar with the same enclosure; make the guides bar hideable. See DECISIONS #75 [T.1].
- **Bug fixed:** `.tools .selbar { display: inline-flex }` overrode the UA `hidden` rule, so the action group was **always visible** in real browsers (the headless suite asserts the `hidden` *property*, which was correct — CSS isn't testable there). Added the `[hidden] { display: none }` guard (same pattern as `.modal-backdrop`).
- **Layout:** toolbar moved below the guidelines bar; both share the same enclosure (border + `--panel` background). The right side of the toolbar is the active tool's **context-sensitive area** (currently the selection group; the HTML title says so).
- **Collapsible guidelines bar:** `guides ▾/▸` toggle button (first in the bar) folds the bar to a slim strip (`.guides.collapsed` hides lock/add/list, toggle stays). State = setting `guidesCollapsed` (settingsDefaults, default expanded) via `setGuidesBar(collapsed)` — applied at the **end of init** (after `loadSettings()`; calling it in the wiring section crashed init — init-order gotcha, see DECISIONS #75).
- 1 new DOM test (toggle + setting + arrow). **Total 178 tests.**
- **Browser-verify (user):** action group truly hidden without a selection; toolbar position/enclosure; guides bar collapse/expand across a reload (state remembered).

### [T.2] Rollback: collapsible guidelines bar (`index.html` + `css/style.css` + `js/app.js` + `test/` + docs, 2026-11-18)
User retraction (2026-11-18): the collapse feature isn't wanted after all — the bar costs little space and should stay in plain sight. **Reverted:** the `guides ▾/▸` toggle, the `.guides.collapsed` CSS, `setGuidesBar`, the `guidesCollapsed` setting, its seam + DOM test (178 → 177 tests). **Kept from [T.1]:** the selbar-hidden-until-selection fix, the toolbar below the guides bar, and the shared enclosure. The 0.20.1 changelog entry stays as history; 0.20.2 records the removal (the documented "fixes get their own entry" rule). A stray `guidesCollapsed` key may linger in users' settings blob — it's ignored by `loadSettings` (defaults-driven), so no cleanup needed. See DECISIONS #75 [T.2].

### [U] Move/copy paste modes (`js/core.js` + `js/app.js` + `index.html` + `test/` + docs, 2026-11-19)
User request (2026-11-19, greenlit same day): the move-drag's transparency-honoring blend felt counter-intuitive — add a switch to overwrite instead, and let Ctrl+move *copy* the selection (source kept) with the same blend choice. Shipped as the 2×2 {cut, copy} × {merge, replace}:
- **Core:** `placeRect(font, code, rect, dx, dy, mode, cut)` (section [16]) — snapshot → optional source clear → place, clipped. `BF.rectMove` gains an optional mode (default `"merge"` — 4-arg calls are behavior-identical to before); new `BF.rectMoveCopy` = same with the source intact. Bad modes throw.
- **UI:** `paste: merge ⇄ replace` button in the selection bar (context area; label = current mode, click = toggle). Setting `pasteMode` (settingsDefaults, default `merge` = pre-[U] behavior; validated at the point of use via `pasteMode()`). Label synced at the **end of init** after `loadSettings()` (init-order gotcha, DECISIONS #75).
- **Drag:** `onEditorDown` records `copy: !!(evt.ctrlKey || evt.altKey)` at drag **start**; `selDragUp` picks `rectMove` vs `rectMoveCopy` and passes the mode; toast says *Moved/Copied N px* (+ *source kept* for copies).
- **Reference card:** one descriptive entry ("Ctrl/Alt + drag selection") via the registry — the registry-count pin went 40 → 41 (test-dom).
- **Tests:** 1 new core test (modes × cut/copy, overlap, no-op, bad-mode) + 2 new DOM tests (toggle persistence/labeling; full drag cut-vs-copy through the `onEditorDown/Move/Up` seam with Ctrl and Alt). **Total 180 tests.**
- **Browser-verify (user):** toggle label flips and survives reload; plain-drag cut vs Ctrl/Alt-drag copy in merge and replace (watch what happens to existing ink under a transparent part of the selection); card shows the drag entry. ✅ (user confirmed, 2026-11-19)

### [V] Sample fonts: infrastructure (`js/samples.js` + `js/app.js` + `index.html` + `css/style.css` + `test/` + docs, 2026-11-22)
User request (2026-11-22): "let users load up some demo font, or have one pre-loaded if nothing has been created before… Create the infrastructure needed for this, I'll go create some .bitforge files we could use as samples." Shipped:
- **Registry:** new `js/samples.js` (two registrations: `<script src>` before app.js + `load(...)` in test/run.js). `BF_SAMPLES = []` — entries `{ id, name, description, default?, json }`, `json` = a `.bitforge` project file string. **Embedded, not fetched** — `fetch()` of local files is blocked under `file://`, and a `samples/` folder would need a build/copy step. Header documents the add-a-sample procedure.
- **UI:** File → **Load sample…** (menu-only, no shortcut) → picker modal (standard close paths; Escape busy-check updated). Empty registry ⇒ empty-state paragraph (never a dead item). Entry click ⇒ confirm ⇒ `setFont` + `applyImportedSettings` (the project-import path) ⇒ toast. `validateSample()` guards both entry points; an invalid bundled sample toasts the error and is skipped (a build bug, not a user error).
- **First-run preload:** init now uses `loadInitialFont()` = **saved font > default sample (`default: true` else first entry) > blank 8×16**. Supersedes the old "start blank" decision for first-run only — `New` still starts blank. Empty registry ⇒ identical pre-[V] behavior.
- **Tests (184 total, +4):** registry shape + every shipped entry validates (this is the build-time sample validator); picker empty state; entry render + `loadSample` replace/cancel/invalid paths (drives the real `projectExportText` round-trip); first-run preload matrix (sample, saved-wins, invalid fallback, no-samples no-toast).
- **Browser-verify (user):** File → Load sample… opens, shows the empty state, ×/Escape/backdrop close it. (Once [V.1] lands: picker lists the samples; loading one confirms + replaces; first-run preload on a clean profile.)

### [V.1] Server-served sample fonts (`samples/` + `js/app.js` + `index.html` + `test/` + docs, 2026-11-22)
User revision of [V] (2026-11-22): the user now hosts the page on a server and wants to **customize the loadable sample fonts over time** — embedding them in JS "might not be ideal"; **hide Load sample… when not running on a server**; locally testable via a served page. The user attached **`small-and-cozy.bitforge`** (299 KB) as the first sample. Shipped (supersedes [V]'s embedded registry; DECISIONS #78):
- **Samples = server files:** `bitforge/samples/small-and-cozy.bitforge` (user's file, validated: bitforge v1, 8×16, name "small-and-cozy") + `samples/manifest.json` (`[{ id, name, description, file, default:true }]`). Adding a sample = drop file + one manifest entry (no code, no rebuild) — procedure in AGENTS.md. `js/samples.js` **deleted** (both registrations removed) — the folder is the single source of truth; the embedded offline fallback was dropped deliberately (flagged to the user).
- **Runtime fetch + graceful degrade:** `isServed()` (protocol http:/https:). **Not served ⇒ `#mi-load-sample` hidden** (plain `hidden` attr; browser-verify it's actually gone) and first run starts blank (pre-[V] behavior). Served ⇒ `fetchSamples()` pulls `manifest.json` then each entry's file, `validateSampleText()` guards both (one bad entry is skipped with a console note — it can't kill the picker), `buildSamples(manifest, textFor)` is a pure testable seam. Partial manifest failures still show the good samples.
- **First-run preload:** retained from [V] but **gated on `isServed()`** — served clean profile ⇒ the `default` sample loads ("(first run)" toast); identity-guarded so a font the user changed before the fetch settles is never clobbered. `init()` captures `savedFont` up front (`setFont` → `saveLS` would otherwise fool a later `loadLS()` re-check).
- **Test harness upgrade (shared file, backward-compatible):** `test/harness.js` now **awaits a Promise returned by a test** (serial, in order, exit code preserved; sync tests unaffected) — this is what lets 3 new tests drive the real fetch→validate→render→`loadSample` pipeline headlessly via a fake `globalThis.fetch`/`location` (`bfFakeFetch` routes, every test restores env in both settle paths).
- **Tests (185 total):** −4 old embedded-registry tests, +5 new (file:// not-served; `buildSamples` pure; served happy-path async incl. cancel no-op; served partial/broken entry; first-run preload). **Browser-verify (user, requested this turn):** served page → Load sample… visible, lists *Small & Cozy (default)*, load confirms + replaces + toasts; clean profile → preloaded; `file://` → hidden + blank.
- **Docs:** DECISIONS #78 (#77 marked superseded-in-part); DESIGN persistence section; AGENTS.md samples procedure + async-harness note; changelog 0.22.1 in both files.

### [W] Dark mode (`css/style.css` + `index.html` + `js/app.js` + `test/` + docs, 2026-11-23)
User request (2026-11-23): "Can we add a darkmode as well? This should be both selectable manually (light - current theme, dark - to be implemented, and auto - selected according to what browser reports). Auto should be the default." Shipped (DECISIONS #79, version 0.23.0; same-version fix 2026-11-23: selector mini-glyph ink now follows the theme — regression-tested):
- **Setting:** `theme` = `light | dark | auto` (default **auto**) in the settings API ⇒ persisted in `localStorage` and carried by `.bitforge` project files; import applies it (`applyImportedSettings` → `applyTheme()`).
- **Resolution & application:** explicit choice always wins; `auto` follows `matchMedia("(prefers-color-scheme: dark)")` with a **light fallback** (headless stub has no matchMedia). Resolved theme = `state.theme` + `<html data-theme>`; all chrome colors are **CSS custom properties** (light in `:root`, dark in `html[data-theme="dark"]`); the **editor + glyph-selector canvases** read the `themeColors()` palette (dark: bg #1d1d1d, ink #e6e6e6, grid #333; status tints reuse the existing dark variants). Redraw happens only when the *resolved* theme actually changed.
- **UI:** Edit menu, bottom — radio group **Theme: Light / Dark / Auto** (`.mi-radio`/`.mi-check` CSS, checkmark via `syncThemeMenu()`). Deliberate: no new View menu (Edit already hosts Properties/Resize).
- **Scope split (judgment call, surfaced in changelog):** Preview/Atlas render surfaces are **not themed** — the *Inverted* checkbox remains their single switch (user prefers white bg for seeing fonts clearly); **exports are never themed** (black ink, white/transparent).
- **Live reactivity:** `watchSystemTheme()` arms the matchMedia `change` listener (fully guarded); `applyTheme()` re-resolves and is a no-op unless the resolved theme differs — explicit choices ignore later system flips.
- **Tests (191 total, +6, new `test/test-theme.js`):** `resolveTheme` pure matrix · default auto + headless apply → light + `<html>` attr + menu check · persisted dark choice (setting + attr + menu + palette) + bogus no-op · fake-matchMedia live reactivity (env faking/restore pattern from test-samples.js) · import-pickup · **selector-ink regression** (dark ⇒ light ink `#e6e6e6`, light ⇒ black ink `#111`, asserted via the stub ctx's recorded `fillRect` fillStyles). Stub gained `document.documentElement` (records `data-theme`) + ctx `rects` recording; seam gained the theme fns + `redrawAll` (deterministic redraw in tests). Light palette normalized to pre-[W] literals so the light look is pixel-identical to before.
- **Export audit (user request, 2026-11-23):** `atlasCanvas()` (PNG file + clipboard), `glyphCanvas()` (glyph copy), `selCanvas()` (selection copy) all hardcode `#000` ink + `#fff`/transparent bg — verified theme-proof; nothing to change.
- **Docs:** DECISIONS #79; DESIGN persistence bullet; AGENTS.md theme + test-file registration notes; changelog 0.23.0 in both files.

### [X] Persist the last selected glyph (`js/app.js` + `samples/` + `test/` + docs, 2026-11-23)
User request (2026-11-23): "make the last selected glyph persist — when I open the app again, it doesn't start at 0x00, but at the last glyph I chose. Persist it in the .bitforge file too, and update the sample file to start at glyph 'B' (0x42)." Shipped (DECISIONS #80, version 0.24.0):
- **`selCode` (number, default 0)** joins the settings API (DECISIONS #40): `selectGlyph()` persists it (every selection path funnels through it), `init()` restores it right after `loadSettings()` (before `setFont` — init-order rule honored), `applyImportedSettings` re-selects it **only when the imported object carries the key** (older files keep the current selection).
- **Sample:** `samples/small-and-cozy.bitforge` settings gained `"selCode": 66` (0x42 "B").
- **Tests (196 total, +5):** new `test/test-selcode.js` — select ⇒ persisted (setting + localStorage blob) · import-with-key ⇒ restored (+ 999 ⇒ clamped to 255) · import-without-key ⇒ selection untouched (path taken via a guaranteed-differing pvScale) · `projectExportText` carries it · defaults table guarded via new seam `settingsDefaults()`. New: `run-tests.sh` gained a **python3 shipped-sample file check** (jsc has no file reads; asserts the real sample is a valid bitforge project with selCode 66).
- **Docs:** DECISIONS #80; STATUS plan entry; changelog 0.24.0 in both files; version pin 0.24.0.

### [Y] Menu-bar rearrangement (`index.html` + `js/app.js` + `test/test-dom.js` + docs, 2026-11-23)
User request (2026-11-23): rearrange the menu bar so it's obvious what each item acts on, without lumping confusing things together. The user's own sketch — **Project / Font / Glyph / App** — was kept (they explicitly allowed a better distribution; this one was good). Shipped (DECISIONS #81, version 0.25.0):
- **Project** (ex-File, all file I/O): New font · Open PNG…/BDF…/project…/sample… · Import PNG from clipboard ─ Export PNG (solid/transparent) · Copy PNG to clipboard · Export BDF · Export project… · Export Verilog ROM. Shortcuts unchanged.
- **Font**: the live font-info line (moved out of the old About menu; `#about-font-info` → **`#font-info`**, re-rendered on each **Font**-menu open by `renderFontInfo()`) · Properties… · Resize….
- **Glyph**: Undo/Redo · Clear glyph · Mirror L–R / U–D · Copy to codepoint… · Cycle glyph status · Mark done & next · Copy glyph to clipboard.
- **App**: Theme: Light/Dark/Auto radios (moved out of Edit) · Changelog… · About bitforge….
- **Renamed:** "Load sample…" → **"Open sample…"** (menu item + title, sample-picker modal head, confirm text); "New font" keeps its name (project-creation verb users expect).
- **Mechanics:** item ids (`mi-*`) are unchanged — only their containers move — so all `menuItem()` wiring, shortcuts and titles are untouched. Changed: the three old menu containers in `index.html` (now four); the `el` map (`menuFile→menuProject`, `menuAbout→menuApp`, plus new `menuFont`/`menuGlyph` and matching `mb*`); the `menuEls`/`menuPairs` lists. No CSS change (menus are styled by class, not id).
- **Tests (196 total, count unchanged):** the menu-mechanics tests in `test-dom.js` now drive **all four** menus (open/switch/hover-switch/item-click-close/toggle/Escape) — they are the guard that the JS wiring follows the DOM. The font-info test reads `els["font-info"]` after `mb-font`; the About-modal test dispatches `mb-app`.
- **Docs:** DECISIONS #81; DESIGN.md menu-bar paragraph + Font/preview persistence bullets; TESTING.md menu bullets; README menu references; version pin 0.25.0; changelog 0.25.0 in both files. (Also back-filled: [X] was missing from the Current-state list and the Versions table — fixed here.)

## Plan — this round (user greenlit 2026-11-23, easiest → hardest)

### [X] Persist the last selected glyph — **done** (2026-11-23; see Completed + DECISIONS #80) → 0.24.0
User: "make the last selected glyph persist — when I open the app again, it doesn't start at 0x00, but at the last glyph I chose. Persist it in the .bitforge file too, and update the sample file to start at glyph 'B' (0x42)."
- `selCode` joins the **settings API** (DECISIONS #40) ⇒ localStorage + rides `.bitforge` (export already ships the whole settings cache; import applies it via `applyImportedSettings`).
- `selectGlyph()` persists it; init() restores it; `applyImportedSettings` restores it when the file carries one (old files without the key keep the current selection).
- `samples/small-and-cozy.bitforge` gains `"selCode": 66` (0x42, "B").
- Analysis: cheapest possible shape — no new blob field, no UI. Risk: none meaningful; the only subtlety is the init-order rule (never touch settings before `loadSettings()`).

### [Y] Menu-bar rearrangement — **done** (2026-11-23; see Completed + DECISIONS #81) → 0.25.0
User: arrange all existing items sensibly without lumping confusing things together; their sketch was Project / Font / Glyph / App and they explicitly allowed a better distribution/naming. We keep their naming — it is good.
- **Project** (ex-File, all file I/O): New font · Open PNG… / BDF… / project… / sample… ("Load sample…" renamed to **Open sample…**) · Import PNG from clipboard ─ Export PNG (solid/transparent) · Copy PNG to clipboard · Export BDF · Export project… · Export Verilog ROM. Shortcuts unchanged.
- **Font** (font-level): the font-stats info block (moved out of About) · Properties… · Resize…
- **Glyph** (the selected glyph): Undo/Redo · Clear glyph · Mirror L–R / U–D · Copy to codepoint… · Cycle status · Mark done & next · Copy glyph to clipboard
- **App**: Theme: Light/Dark/Auto · Changelog… · About bitforge…
- Implementation note: item ids (`mi-*`) stay the same — only the containers move — so `menuItem()` wiring is untouched; the `el` map gains `menuFont`/`menuGlyph`, renames `menuFile→menuProject`, `menuAbout→menuApp`; `menuEls`/`menuPairs` lists update. CSS is class-based (no menu-id selectors). test-dom.js references to `menu-file`/`menu-edit`/`menu-about`/`about-font-info` update to the new ids (that test is the guard that the wiring follows the DOM).

### [Z] Dogfooding mode + Export TTF — **done** (2026-11-24; 0.26.0)
User: "use the font being edited as the font of bitforge's own UI, live or on demand; think about synergies (export in a format usable by other webpages / general apps); the switch must stay usable if the font has blanks; blanks (save for space?) never enter the dogfooding format so they fall back."
- **`js/ttf.js`** (pure, jsc-testable): `BF_TTF.build(font, family) → Uint8Array` minimal deterministic TrueType font — 10 tables, blank codes absent from the cmap (per-codepoint fallback), 0x20 keeps its slot, `unitsPerEm = height × round(1024/height)`. See [DESIGN.md](DESIGN.md) → "Dogfooding + TTF export" + DECISIONS #82 (incl. the hard-won glyf-flag lesson: flags are **0x01**).
- **App wiring:** App menu → **Dogfood this font** (`dogfood` setting, rides `.bitforge` files); `applyDogfood()` injects `@font-face` (family `bf-dogfood`) + `<html data-dogfood>`; live debounced rebuild on edits; `#toolbar` stays on the system stack (safety). **Project → Export TTF font** (`Alt+Shift+T`) → `<fontname>.ttf`.
- **`tools/verify-ttf.py`** (macOS builtins only): independent oracle — CoreText load, metrics, cmap semantics, exact ink bboxes, soft render-pixel check. `.bitforge` or bare `.ttf` input.
- **Tests:** `test/test-ttf.js` (23) + `test/test-dogfood.js` (5) → **225/225**; verifier PASS on Small & Cozy.
- **Browser-verify list (user):** toggle Dogfood on with Small & Cozy (UI renders in it, menu bar still system font); toggle with a mostly-blank font (fallback per character, toggle still readable); draw a pixel and confirm the UI font updates within ~half a second; Export TTF + open the `.ttf` in a throwaway HTML page; run `python3 tools/verify-ttf.py samples/small-and-cozy.bitforge`.

### [Z.1] Beta badges — **done** (2026-11-24; 0.26.1)
User: badge **Dogfood this font** + **Open BDF…** + **Export BDF font** + **Export TTF font** as beta; reasons and the TTF baseline/underline limitation recorded in DECISIONS #82 (do NOT fix the baseline issue yet). Follow-up instruction: the badge sits **right next to the label text** (not pushed across the item).
- `index.html`: `<span class="mi-badge">Beta</span>` inserted after the label of the 4 items (ids `mi-dogfood`, `mi-open-bdf`, `mi-export-bdf`, `mi-export-ttf`).
- `css/style.css`: new `.mi-badge` rule (10px uppercase, muted, 1px border, 3px radius); base `.menu-items button` switched `space-between` → flex-start with `.mi-key { margin-left:auto }` (identical look for all existing items, badge stays adjacent to its label). No JS, no new shortcut, no new setting.
- Version 0.26.1 (core.js + test-dom.js pin + both changelogs).

**[N] QA checks are fully done** (N.1 + N.2 + N.3 — both deferred checks #46/#47 shipped with per-glyph silencing).

### [P] Font name + Properties modal — **done** (2026-11-16; see Completed + DECISIONS #70)
Font name (`font.name`, default `font`) wired into export filenames + BDF `FONT` line; name derived from the source filename on import; **Edit → Properties** modal (editable name + live font info).

### [Q] Cell resize — **done** (2026-11-16; see Completed + DECISIONS #71)
**Edit → Resize…** modal: per-edge row/column deltas (crop/extend at a chosen edge), live result readout, guidelines + slant baseline shift with it, clip warning on lossy crops, one undo step (new full-font history entry). **Refined in [Q.1]** (DECISIONS #72): the clip warning lists the affected glyphs.

### [S] Glyph-manipulation tools — **done** (2026-11-18; see Completed + DECISIONS #74)
Mirror left–right / up–down · Copy to codepoint… · empty-printable QA check. See the Completed entry below.

### [T] Editor toolbar + selection tools — **done** (2026-11-18; see Completed + DECISIONS #75)
Paint/erase/select toolbar · rectangular marquee · fill/clear/invert/copy/copy-to · move-by-drag · Esc deselects. **Refined in [T.1]**: selbar-hidden fix, toolbar below the guides bar (same enclosure). The [T.1] collapsible-guides-bar was **rolled back in [T.2]** (user retraction).

### [O] Polish — the next chunk when the user picks it
See the open [O] item below; likely candidates: editor hover crosshair, jump UX, slant-spill clipping, guideline visual polish.

### [O] Polish (catch-all)
**[O.1]–[O.8] are done** (Preview control cleanup, newline fix, project file, bound-guide off-by-one fix, clipboard PNG atlas, reference-glyph hint, docs reorg, screenshot + MIT license — see Completed + DECISIONS #62–#69). The rest of [O] is still open:

Browser-verify the visuals and interactions (the agent can't screenshot). Likely small fixes: slant spill clipping, jump UX, preview wrap width, hover cursor on the editor, layout nits, guidelines visual polish (line thickness, colors).

**Handover note for the next agent:** A–N + O.1–O.8 are done. The repo root now has `README.md` (user/dev), `AGENTS.md` (agents) and `LICENSE` (MIT) — `docs/` holds DESIGN/DECISIONS/STATUS/TESTING + `screenshot.png`. Remaining: [O] polish (catch-all) — in particular the accumulated browser-verification lists above (the agent can't screenshot; the user verifies). After each chunk: run `./test/run-tests.sh`, update this file's checkboxes + add a Completed section, commit. Pure-logic pieces belong in `core.js` with tests; DOM wiring in `app.js`.

**Fixed during review (user-reported):** editor click→cell mismatch + non-square cells. The canvas CSS size wasn't pinned, so flexbox stretched it to the panel and `getBoundingClientRect()` no longer matched the internal pixel size. Fix: `setCanvasSize()` pins `style.width/height` to the internal size; `.canvas-wrap canvas { flex: 0 0 auto }` stops the stretch; the wrapper scrolls instead. Now 1 internal px = 1 CSS px in all browsers. Regression-tested in `test-dom.js` (asserts CSS size == internal size).

## Open items / verify during implementation
All closed (2026-11-16): slant formula shipped in [D]; `file://` layout confirmed working from day one; PNG import edge cases covered by tests (E) and in use; the user verified the clipboard roundtrip, the README hero image, and a **real exported Verilog ROM file** against their toolchain (bit order fine, or trivially adjustable on their hardware side).

## Notes for the next agent
- Read [DECISIONS.md](DECISIONS.md) first — most things are locked; don't re-litigate.
- Read [TESTING.md](TESTING.md) before touching `js/core.js` or adding tests.
- **Run `./test/run-tests.sh` after any change to `js/core.js`.**
- Keep pure logic in `js/core.js` (testable); put DOM/canvas in `js/app.js`.
- Ink = 1/black; transparent = 0/white. Keep that consistent everywhere.
