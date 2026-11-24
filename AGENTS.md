# AGENTS.md — working on bitforge with an AI agent

This file is the entry point for agents (and human contributors) picking up work in this repo. The full context lives in `docs/`; this file is the map plus the rules.

## Read order (before changing anything)

1. [docs/DECISIONS.md](docs/DECISIONS.md) — numbered, locked requirements/decisions. **Do not re-litigate.** If the user reopens a decision, add a new numbered entry referencing the old one (refinements amend the original in place — see #65).
2. [docs/DESIGN.md](docs/DESIGN.md) — architecture: data model, UI layout, modules, I/O formats, rendering.
3. [docs/STATUS.md](docs/STATUS.md) — the de-facto handoff document: Current-state checklist (**the single source of chunk positions and version numbers**), Versions table, Completed log (per-chunk detail), Plan (what's left, incl. the accumulated browser-verify lists).
4. [docs/TESTING.md](docs/TESTING.md) — read before touching `js/core.js` or adding/changing tests.

## Hard constraints (do not break)

- **Vanilla JS only.** No Node, TypeScript, bundlers, frameworks, or external libraries.
- **No ES modules** — the app must run from `file://` via double-click (plain classic `<script>` tags).
- **8-bit codepoints only**: exactly 256 glyphs per font; the atlas is always a 16×16 grid of cells (the *cell size* varies).
- **Ink = black/`1`; background = white-or-transparent/`0`** — keep this consistent everywhere.
- **Pure logic in `js/core.js`** (global `BF`, DOM-free, unit-tested); **DOM/canvas in `js/app.js`**.

## Tests

Headless under macOS JavaScriptCore (`jsc`) — no Node, no browser. From the repo root:

```sh
./test/run-tests.sh    # exit 0 = all pass; 1 = failures
```

Rules that bite:

- New pure-logic module ⇒ `test/test-<module>.js` **and** a `load(...)` line in `test/run.js`.
- **New `.js` file ⇒ TWO registrations:** a `<script src>` in `index.html` (before `js/app.js`) **and** a `load(...)` in `test/run.js`. The headless stub doesn't parse `index.html`, so a forgotten script tag is invisible to the suite and surfaces in the browser only as `ReferenceError: Can't find variable: …` (this actually happened — chunk [R], 2026-11-17).
- `BF.VERSION` is **pinned** by a test in `test/test-dom.js` — a bump must update that pin in the same commit.
- **Changelog data is tested**: `BF_CHANGELOG` (in `js/changelog.js`, loaded by `test/run.js`) must be strictly descending, have ≥1 change per entry, and its newest entry must equal `BF.VERSION` — a bump without a changelog entry fails the suite (DECISIONS #73).
- The **shortcut registry count** is asserted in `test/test-dom.js` — every new `shortcuts.register(...)` call must update it.
- DOM tests share one app instance — clean up font/status mutations you make, or later tests fail (see the cross-test state-bleed note in TESTING.md).
- Stub seams (`__stub.app`, `__stub.dispatch`, `__stub.setClipboard`, …) are documented in TESTING.md. The headless stub does **not** parse `index.html`, so static HTML text/attributes can't be asserted headlessly.
- **Sample fonts** are **server files**, not code (DECISIONS #78): drop a `.bitforge` into `samples/` and add a row to `samples/manifest.json` (`{ id, name, description, file, default? }`). No code change, no build step, nothing to register. The served path is exercised headlessly with a fake `globalThis.fetch`/`location` (see `test/test-samples.js`); a bad sample is skipped at runtime, not a build failure.
- **The harness awaits async tests** (since [V.1]): a `test(...)` whose function returns a **Promise** is awaited before the next runs (serial, in order, exit code preserved). Use this for `fetch`-style flows; sync tests are unaffected.
- **TTF / dogfooding (DECISIONS #82):** `js/ttf.js` is the single producer of TrueType bytes (dogfooding + Export TTF). The glyf per-point flag for "on-curve + 16-bit deltas" is **0x01** — do NOT "simplify" it to 0x07 (that means 1-byte deltas) or 0x10 ("x same as previous"): both were real regressions, and the spec bits are counter-intuitive (0x02/0x04 = delta is 1 *byte*). `test/test-ttf.js` decodes per spec (flag-driven) and `tools/verify-ttf.py` proves the output against CoreText + fontTools — **run `python3 tools/verify-ttf.py samples/small-and-cozy.bitforge` whenever you touch `js/ttf.js` or the dogfood path**, in addition to the suite.

## The per-chunk ritual (follow it, in order)

1. Implement — pure logic in `core.js` (+ tests), DOM wiring in `app.js`.
2. `./test/run-tests.sh` — green.
3. Bump `BF.VERSION` in `js/core.js` — **0.MINOR.PATCH**: MINOR = the chunk's 1-indexed position in the STATUS.md Current-state list, PATCH = the wave sub-index (DECISIONS #56) — and update the pin in `test/test-dom.js`. **Also add the changelog entry to `js/changelog.js` AND `CHANGELOG.md` in the same commit** — follow the **"How to add an entry" section in `CHANGELOG.md`** (format, ordering, both files; DECISIONS #73). The data-sanity test fails if the bump has no matching entry.
4. Update the docs: a new numbered entry in `docs/DECISIONS.md`; in `docs/STATUS.md` — the Current-state line, the Versions table row, the Completed section entry, and the Plan section. Update `README.md` when user-facing behavior changes.
5. Commit: `git add -A && git commit -m "bitforge [X]: <summary>"` (X = the chunk label, e.g. `[O.7]`).
6. Open `index.html` in the in-app browser and **ask the user to verify visually** — the agent can't screenshot.

## Standing conventions (violating these is how this codebase rots)

- **New shortcut ⇒ `shortcuts.register({ combo, description, handler })`, full stop** — no raw `keydown` listeners for app shortcuts. The in-app reference card (toggle with `?`) renders from the registry, so it can't drift (DECISIONS #35).
- **New persistable value ⇒ the settings API** — an entry in `settingsDefaults` + `settingsGet`/`settingsSet` (DECISIONS #40). No ad-hoc `localStorage` writes. **One documented exception:** the last-run version key `bitforge.version.v1` (DECISIONS #73) is app metadata, not user data — it stays outside the settings blob and the project file.
- **New QA check ⇒ an entry in `qaChecks`** with `severity` + `silenceable`; the silencing machinery derives the known check ids from it — there is no second literal list.
- **New QA check *property* ⇒ `props` declaration + core validation (DECISIONS #83, chunk [AA]):** declare `props: { key: { label, options } }` on the `qaChecks` entry, put the value in `font.checkProps` (per-font — rides the blob's `cp` field + `.bitforge`; `fontFromBlob` sanitizes, unknown ids dropped), keep the math/validation in `core.js` next to that check's existing math. The QA summary strip renders declared props as inline checkboxes generically — **no per-property UI code, no settings entry.** Toggling a prop is a font mutation (`bumpFontVersion` + `saveLS` + `qaRefresh`), no-op-safe.
- **Theme (DECISIONS #79):** the user's *choice* is the `theme` setting (`light|dark|auto`, default auto, via the settings API ⇒ rides `.bitforge` files); the *resolved* theme is `state.theme` + `<html data-theme>`. Canvas surfaces get colors from `themeColors()`, not literals. **Do not theme the Preview/Atlas render surfaces or exports** — those stay under the *Inverted* checkbox / black-on-white-by-design.
- **New test file ⇒ one registration**: `load("test/test-<name>.js")` in `test/run.js` (after the stub + app.js loads for seam tests). No index.html entry for test files.
- **Docs are handover-grade and updated as you go** — STATUS.md must let the *next* agent resume cold. Commit docs in the same commit as the work.
- The user's suggestions are **weak suggestions**: you may refine or rework, but surface the deviation clearly in the reply.
