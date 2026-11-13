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
  run-tests.sh     # entry point you run; finds jsc and executes run.js
  run.js           # loads core.js + harness + every test-*.js, then runs them
  harness.js       # tiny test framework (no dependencies)
  test-model.js    # tests for core.js section [1]
  test-verilog.js  # tests for core.js section [2]
  ...              # one more file per pure-logic module
```

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

DOM-dependent behavior is not unit-tested here: canvas pixel output, pointer→cell mapping, tab switching, PNG load/save round-trips, localStorage persistence. Those are verified by opening `index.html` in a browser (see [STATUS.md](STATUS.md), "Open items"). The pure *computations* behind them — slant offsets, the ink/luminance test, markup parsing, Verilog text, row bitmasks — live in `core.js` and **are** tested.
