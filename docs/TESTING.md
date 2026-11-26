# bitforge — Testing Guide

How to **run** and **write** the unit tests. Read this if the setup looks unusual — it is, by design, and the reason is the no-Node / no-build / no-dependencies constraint.

## Why it looks this way (TL;DR)

- **There is no Node, no build step, no test framework, and no browser in the loop.** The project must run as plain `.js` opened from `file://`.
- To still unit-test the logic headlessly (without a person, without a browser), we run plain JavaScript under **JavaScriptCore (`jsc`)** — the JS engine that ships with macOS. `jsc` executes a `.js` file in a terminal, which is enough to test all of our **pure logic**.
- Only the **pure, DOM-free** code is testable this way. That's why the code is deliberately split into two files:
  - **`js/core.js`** — pure logic (no `document`, no `canvas`, no `localStorage`). Exposes a global object **`BF`**. This is what gets unit-tested.
  - **`js/app.js`** — all DOM/canvas wiring (rendering, editor, preview, atlas, PNG file I/O, UI). Not unit-tested headlessly; verified by opening `index.html` in a browser.

Rule of thumb: **if a function doesn't touch the DOM, it lives in `core.js` and gets a test. If it must touch the DOM, it lives in `app.js` and is checked in-browser.** Keep that split clean — the moment DOM sneaks into `core.js`, `jsc` chokes and every test fails.

## Files

```
test/
  run-tests.sh     # entry point you run; finds jsc, runs run.js under a 60 s watchdog
  run.js           # loads core.js + harness + every test-*.js, then runs them
  harness.js       # tiny test framework (no dependencies)
  test-model.js    # tests for core.js section [1]
  test-verilog.js  # tests for core.js section [2]
  ...              # one more file per pure-logic module
  test-ttf.js      # tests js/ttf.js — a spec-conformant in-file sfnt reader decodes the output
  test-dogfood.js  # tests the dogfood toggle + TTF export wiring (needs the DOM stub)
  stub-dom.js      # minimal DOM/canvas/localStorage stub (for the DOM smoke test)
  test-dom.js      # smoke test: runs app.js's init() under the stub
```

## The TTF verifier (independent oracle, not part of the suite)
`tools/verify-ttf.py` is a **separate** macOS-only check for the TrueType output (dogfooding + Export TTF). It does not run under `run-tests.sh`; it uses `python3` + `jsc` + the system font engine (CoreText) as an **independent oracle** — the app's own tests parse the TTF with their own in-file reader, which could share a bug with the builder, so this tool re-proves the bytes against a real font engine.

```sh
python3 tools/verify-ttf.py samples/small-and-cozy.bitforge   # build .bitforge -> TTF, then verify
python3 tools/verify-ttf.py yourface.ttf                      # verify a bare exported .ttf
```

It checks: CoreText accepts the font, `unitsPerEm`/family name, cmap semantics (inked codes → inked glyphs, blank codes never → ink — the dogfooding safety rule), advances, **exact ink bounding boxes**, and a soft bitmap-render pixel-count match. Exit `0` = pass. **Run it whenever you touch `js/ttf.js` or the dogfood path** — it is the guard that the font is genuinely valid, not just self-consistent.

## How to run

```sh
cd bitforge
./test/run-tests.sh
```

- `run-tests.sh` first `cd`s to the project root (so `load()` relative paths resolve), then locates `jsc`:
  - `jsc` on `PATH` if present, else
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc` (macOS default).
- It prints one line per test (`ok` / `FAIL`) plus a `TOTAL … passed … failed` summary.
- **Exit code: `0` = all pass · `1` = at least one failure · `2` = jsc not found.** This is how it can gate in a script or CI.

You can also invoke the engine directly (from the `bitforge/` root):

```sh
jsc test/run.js
```

## How to write a test

1. **Put the logic you're testing in `js/core.js` and expose it on `BF`.** (If it needs the DOM, it belongs in `app.js` and can't be tested here.)
2. Create `test/test-<module>.js`.
3. Register it in `test/run.js` with a `load(...)` line.
4. Write `test(...)` blocks using the harness helpers below.
5. Run `./test/run-tests.sh`.

### Harness API (defined in `harness.js`, available as globals)

| Helper | Meaning |
|--------|---------|
| `test(name, fn)` | Register a test. `fn` runs synchronously; throw to fail. |
| `assert(cond, msg?)` | Fail unless `cond` is truthy. |
| `assertEqual(actual, expected, msg?)` | Fail unless `actual === expected` (**strict**). |
| `assertThrows(fn, msg?)` | Fail unless calling `fn()` throws. |
| `__runAll()` | Runs everything, prints the summary, and `quit()`s with the exit code. Called once at the end of `run.js` — you don't call it yourself. |

### Worked example

From `test/test-model.js` — a pixel set on one glyph must not bleed into a neighbour:

```js
test("pixels are independent per glyph", function () {
  var f = BF.makeFont(8, 16);          // BF is the core.js API
  BF.setPixel(f, 0, 0, 0, 1);
  BF.setPixel(f, 1, 0, 0, 1);
  assertEqual(BF.getPixel(f, 0, 0, 0), 1);
  assertEqual(BF.getPixel(f, 1, 0, 0), 1);
  assertEqual(BF.getPixel(f, 2, 0, 0), 0, "third glyph must stay clear");
});
```

`assertEqual` uses strict `===`, so a number vs. a string won't pass silently.

## Conventions / gotchas

- **`core.js` stays DOM-free.** No `document`, no `window` (except the global-target in the module footer), no `canvas`, no `localStorage`.
- **`BF` is the only cross-file handle.** Tests call `BF.<fn>`; `app.js` also calls `BF.<fn>`. Don't reach into `core.js` internals any other way.
- **`load()` paths are relative to the current working directory** — that's why `run-tests.sh` `cd`s to the project root first. If you run `jsc` by hand, run it from `bitforge/`.
- **No frameworks, no Node, no `npm`.** If you're about to `require` something or add a test-runner library, stop — it breaks the "runs from `file://` with zero dependencies" constraint. The ~50-line `harness.js` is the whole framework, on purpose.
- **`jsc` is macOS-specific** (the fallback path is macOS's JavaScriptCore). The test files are plain JS, so they'd also run under Node elsewhere — but on this project we only rely on `jsc`.
- **The exit code matters.** `run-tests.sh` returns non-zero on failure, so you can chain it: `./test/run-tests.sh && echo green`.

## What this does NOT cover

Most DOM-dependent behavior is not unit-tested: canvas pixel output, pointer→cell mapping, PNG load/save round-trips. Those are verified by opening `index.html` in a browser (see [STATUS.md](STATUS.md), "Open items"). The pure *computations* behind them — slant offsets, the ink/luminance test, markup parsing, Verilog text, row bitmasks — live in `core.js` and **are** tested.

### The DOM smoke test (stub-dom.js + test-dom.js)

A thin slice of the DOM layer **is** run headlessly: `test/stub-dom.js` fakes just enough of `document` / `window` / `localStorage` for `app.js`'s `init()` to execute, and `test/test-dom.js` asserts on the result (canvas sizes, CSS size pinning, localStorage persistence, click wiring). This catches element-ID typos, `BF`-method typos, and init-time crashes — it does **not** verify visuals.

Event wiring **can** be exercised: stub elements record their listeners, and `__stub.dispatch(id, type, evt)` invokes them with `this` bound to the element (e.g. `__stub.dispatch("selector", "click", { clientX: 8, clientY: 8 })`). Use this to test pointer→target mapping logic — see the selector click test in `test-dom.js`.

Stub gotchas, learned the hard way:
- **`querySelectorAll` returns fake element lists for the selectors `app.js` actually uses** (`.tab`, `.gadd button`). It used to return `[]` for everything, which silently skipped those wiring loops — that's how an infinite-loop bug in a guidelines loop shipped untested (the loop's index variable was wrong, but with zero elements the loop never ran). If you add a new `querySelectorAll` call in `app.js`, extend the stub so the loop actually executes.
- **`run-tests.sh` has a 60 s watchdog** that kills `jsc` and fails the run if it hangs (exit 1). A hang almost always means an infinite loop in the code the stub now exercises.
- The guidelines feature itself (presets, drag, lock, list UI) lives in the `app.js` closure and is **not** directly unit-testable headlessly — only covered by the `init()` smoke test plus browser verification.

### Clipboard / file-I/O stubs (chunk [K])

The stub also fakes the file/clipboard surface so the app's download and clipboard paths run headlessly:
- `URL`, `Blob`, `FileReader`, `Image`, `navigator` (with `clipboard: null` by default), and `ClipboardItem` are provided as globals.
- `canvas.toBlob(cb)` calls `cb(__stub.blob || null)` — by default `null` ("rasterization failed"); set `__stub.blob = {…}` to exercise the success path, and remember to reset it to `null` afterwards.
- `__stub.setClipboard("available" | "none")` flips `navigator.clipboard`. In `"available"` mode `write(items)` records the items in `__stub.clipboardCalls` and returns a **synchronously-settling thenable** (the `ok` callback runs immediately) so tests stay deterministic — jsc microtask flushing at exit is not relied upon.
- `app.js` records every toast in `lastToast`; the seam exposes `__stub.app.getLastToast()` for asserting toast messages (e.g. import success, clipboard fallback).
- Seam additions from [K]: `importBdfText(text, name?)` (returns `true`/`false`), `exportBdf()`, `copyGlyph()`, `glyphCanvas(code, scale)`.
- `document.activeElement` is a plain settable property (default `null`). Set it to e.g. `{ tagName: "INPUT" }` to exercise the shortcut dispatcher's input suppression (chunk L.1); reset it to `null` afterwards.
- Stub elements' `classList` **tracks classes for real** (`toggle(c, force)` / `add` / `remove` / `contains`) — assert on it to check active states (e.g. the Edit-tab status buttons, open menus).
- **Menu bar:** the menu open/close state is just the `open` class on the four menu containers `#menu-project` / `#menu-font` / `#menu-glyph` / `#menu-app` (DECISIONS #81); drive it with `__stub.dispatch("mb-project", "click", {})` / `"mouseenter"` (likewise `mb-font` / `mb-glyph` / `mb-app`) and item clicks (`__stub.dispatch("mi-copy-glyph", "click", {})` — note that item now lives under the **Glyph** menu). The outside-`mousedown` / `Escape` close listeners are bound on `document`, and are testable via `__stub.docDispatch` (see below).
- **About modal + font info (DECISIONS #81):** open the About modal with `__stub.dispatch("mb-app", "click", {})` + `__stub.dispatch("mi-about-bitforge", "click", {})` and assert `els["about-modal"].hidden`; close via `__stub.dispatch("about-close", "click", {})`. The font-info line lives in the **Font** menu now (`els["font-info"].textContent`) and is re-rendered whenever the Font menu opens — read it right after dispatching `mb-font`.
- **Document-level listeners are now testable:** the stub stores named `document` listeners and exposes `__stub.docDispatch(name, evt)` (e.g. `"mousedown"`, `"keydown"`) for the menu outside-close / Escape paths. The stub does **not** model the DOM tree — for code that walks `parentElement` (the menu "inside" check), set the chain in the test: `els["mi-x"].parentElement = els["menu-project"]`. (Regression: the menu-item mousedown bug only became catchable once this existed — see STATUS [L.8].) Backdrop-click close of the modal remains browser-verified only.
- Seam additions from [L.4]: `exportPng(bgMode?)`, `settingsGet`, `settingsSet` (the settings API is now directly assertable).
- **Elements track real children now (chunk N.1):** `appendChild`/`insertBefore`/`removeChild` work, and `children`/`firstChild` reflect them; setting `innerHTML` clears the children (real DOM semantics). Inspect rendered rows, e.g. `els["qa-tbody"].children[i].children[3]` is a QA row's action cell. Buttons created on those rows have no id — call their listeners directly: `btn._listeners["click"][0].call(btn, { stopPropagation: function () {} })`.
- Seam additions from [N.1]: `toggleSilence(checkId, code)` and `qaChecks` (the LIVE array — a test may push a temporary check, e.g. a stand-in silenceable check, and must `pop()` it before finishing).
- Synthetic shortcut events: drive `__stub.app.shortcuts.dispatch({ key, ctrlKey, altKey, shiftKey, code, preventDefault })` directly (the stub's `window.addEventListener` is a no-op). For Alt+letter combos pass the **accented `key` + real `code`** the browser would deliver (e.g. `{ key: "\u2229", altKey: true, code: "KeyN" }` for Option+N) to also cover the `evt.code` normalization.
- **CSS is invisible to the stub** — the [T.1] selbar bug (`display` overriding `hidden`) was only catchable in a real browser; when you style a `hidden`-toggled element, add the `[hidden] { display: none }` guard (see `.modal-backdrop` / `.tools .selbar`) and put it on the browser-verify list. **Init order:** nothing may call `settingsGet`/`settingsSet` before `loadSettings()` runs — that crashed init once (chunk T.1 first attempt). (The [T.1] `setGuidesBar` seam is gone — rolled back in [T.2].)
- Seam additions [T]: `setTool(t)`, `setSel(rect)`, `clearSel()`, `selAction("fill"|"clear"|"invert")`, `selCopyTo()` (chunk [AE]: opens the shared codepoint modal — drive it per the [AE] note below; the rect math itself lives in core and is unit-tested in `test/test-selectops.js`). The pointer→marquee/move glue is browser-verified (the stub doesn't model coordinates); the rect math itself lives in core (`BF.normRect`/`rectFill`/`rectInvert`/`rectMove`/`rectCopy`). The stub canvas ctx gained no-op `save`/`restore`/`setLineDash` (the editor's selection overlay uses them).
- Seam additions [S]: `mirrorAction(axis)` ("h"/"v"), `copyToCodepointAction()`, `parseCodeInput(v)` (the shared codepoint-input parser).
- **Chunk [AE] — in-app dialogs (0.27.7, DECISIONS #88):** `copyToCodepointAction()` and `selCopyTo()` no longer touch the global `prompt` (the stub seam is gone) — both open the shared **codepoint modal** (`#cp-modal`): set `els["cp-input"].value`, `__stub.dispatch("cp-input", "input", {})` for the live result, then `__stub.dispatch("cp-ok"|"cp-cancel"|"cp-close", "click", {})`. Invalid or same-codepoint input is refused with a toast and the modal **stays open** (assert `els["cp-modal"].hidden === false`). New seams: `openNewModal/closeNewModal/createNewFont/newRender` (new-font modal — `els["new-w"]/els["new-h"]` values, `els["new-result"].textContent`, `dispatch("new-create"|"new-cancel"|"new-close", "click", {})`), `openCodepointModal(title, note, from, onOk)/closeCodepointModal/cpRender/cpOk`, `openAskModal(title, text, yesLabel, onYes)/closeAskModal/askConfirm` (shared confirm modal — `dispatch("ask-yes"|"ask-cancel"|"ask-close", "click", {})`), `anyModalOpen()/closeAllModals()`. The `confirm()` stub seam (`__stub.setConfirm`) was removed — the app no longer calls the browser confirm. Escape with a modal open now closes the modal but **keeps the selection** (snapshot-before-close; regression-tested in test-dom.js).
- Seam additions [O.5]–[R]: `copyPngToClipboard`, `importPngFromClipboard`, `importProjectText`, `projectExportText`, `exportProject`, `applyResize`, `exportPng`, `settingsGet`, `settingsSet`, and the changelog pair — `whatsNew()` (entries since the stored last-run version), `openChangelogModal(entries, whatsNewMode)` / `closeChangelogModal()`, plus `changelogVersionKey` (the localStorage key, so tests can set the stored version and re-query `whatsNew()`). `__stub.downloads` records every download filename. Note: `init` runs the what's-new check on startup, so under the stub the changelog modal is opened at init (first run) and a later `__stub.docDispatch("keydown", { key: "Escape" })` will close it again — drive the modal through the seam when you need deterministic state.
- Seam additions [AD] (nonsense generators, DECISIONS #90): `genInsert(text)`, `commitInsert(t, s, e, ins)`, `selStartEnd(t)` (the shared preview-text insertion helpers; `insertGlyphSeq` now uses them too). `test/test-nonsense.js` tests the **pure** `BF_NS` (determinism via a seeded LCG, prose/code structure, no-rng fallback) plus the `genInsert` seam and the two Preview buttons (`__stub.dispatch("pv-gen-prose"|"pv-gen-code", "click", {})`). Remember the two registrations for the new `js/nonsense.js`: a `<script src>` in `index.html` (before `app.js`) and a `load(...)` in `test/run.js`.
