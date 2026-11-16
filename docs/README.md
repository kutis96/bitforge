# bitforge

A **bitmap font editor** for fixed-size, zero-spacing, non-proportional monospaced bitmap fonts — 256 glyphs, any cell size (default 8×16).

Edit 256-character monospaced font atlases, preview glyphs with artificial bold / slant, and export to a PNG atlas and a Verilog `$readmemb` ROM file. Pure vanilla JS — no build, no dependencies. Open `index.html` in a browser and it runs.

## Status

**Functionally complete (pending visual polish).** All logic is unit-tested (139 tests under `jsc`); the full UI is built in vanilla JS. Open `index.html` to use it. See [STATUS.md](STATUS.md).

## Documentation (handover)

| Doc | What it's for |
|-----|---------------|
| [DESIGN.md](DESIGN.md) | Broad architecture: data model, UI, modules, I/O formats, rendering |
| [DECISIONS.md](DECISIONS.md) | Locked requirements/decisions — **read this before changing scope** |
| [TESTING.md](TESTING.md) | How to **run and write** the unit tests (the `jsc` headless setup) |
| [STATUS.md](STATUS.md) | Current progress, completed chunks, next step, open items |

Read order for a new agent: **DECISIONS → DESIGN → STATUS**. Before touching `js/core.js`, read **TESTING.md**.

## How to run (once built)

- No build step, no server, no dependencies.
- Open `index.html` directly in any modern browser (`file://`).
- Plain classic `<script>` (no ES modules), so it works on `file://` double-click.

## Running the tests

The pure logic lives in `js/core.js` (no DOM) so it is unit-tested headlessly under macOS
JavaScriptCore (`jsc`) — no Node, no browser, no dependencies:

```sh
cd bitforge
./test/run-tests.sh
```

Exit code 0 = all pass, 1 = failures. For each new pure-logic module, add a
`test/test-<module>.js` and a `load(...)` line in `test/run.js`.

Full guide — why `jsc`, how to write tests, conventions — is in [TESTING.md](TESTING.md).

## Project layout

```
bitforge/
  index.html          # app shell: DOM, tab structure, controls
  css/style.css       # styling (black-on-white, monospace)
  js/core.js          # PURE logic (model/verilog/markup/slant/ink) — global `BF`, no DOM
  js/app.js           # DOM wiring: editor, preview, atlas, pngio (canvas), ui, main
  test/               # headless unit tests (run under macOS jsc)
    run-tests.sh      #   entry: runs all tests, exit 0 = pass
    run.js            #   loads core + harness + test-*.js
    harness.js        #   tiny test/assert/__runAll framework
    test-*.js         #   one file per module
  docs/               # these handover documents
```

## Hard constraints (do not break)

- **Vanilla JS only.** No Node, TypeScript, bundlers, frameworks, or external libraries.
- **No ES modules** — must run from `file://` via double-click.
- **8-bit codepoints only**: exactly 256 glyphs per font. No Unicode beyond 8-bit.
- Atlas is always **16×16** characters.
- Ink = black/`1`; background = white or transparent/`0`. Keep this consistent everywhere.
- **Pure logic in `js/core.js` (testable); DOM/canvas in `js/app.js`.**
