# bitforge — Design

Broad design. Implementation details are intentionally deferred — this describes *what* the app is and *how the pieces fit together*, not *how every function works*.

## Goals

- Edit a 256-glyph, fixed-size, monospaced bitmap font (black/white).
- Parametric glyph size W×H per font (default **8 wide × 16 tall**).
- Live preview: single-glyph zoom + multi-line text sample, selectable scale, per-character **bold** / **italic (slant)** attributes.
- Render "terminal" effects: **artificial bold** (double-draw, 1px offset) and **slant** (per-row horizontal offset), including on the whole atlas.
- Import/export a PNG atlas and BDF; export a Verilog `$readmemb` ROM; copy a single glyph to the clipboard as PNG.
- Ergonomics: keyboard glyph navigation, reference-glyph underlay, keyboard glyph shifting, a self-maintaining shortcut reference card.
- Glyph status tracking (unfinished / WIP / done) and a QA tab with stale-aware reports (first: duplicate glyphs, "what's left to draw").

## Non-goals

- Proportional/variable-width fonts, anti-aliasing/grayscale, sub-pixel rendering, kerning, ligatures, glyph metrics/spacing.
- Unicode beyond 8-bit; multiple fonts open at once.
- Any server component, build tooling, or dependencies.

## Architecture

Single-page, fully client-side, no server. All state lives in memory (mirrored to `localStorage` as a safety net). PNG and Verilog are import/export only.

```
[User]
  -> UI layer (tabs, controls, <canvas>)
     -> App state (current Font, selected codepoint, view options)
        -> Modules: model / render / pngio / verilog / editor / preview / atlas / ui
```

One `Font` object is the **single source of truth**. Every pane reads from it; editing mutates it and triggers a redraw.

## Data model

```
Font {
  width:      int              // px per glyph, default 8
  height:     int              // px per glyph, default 16
  data:       Uint8Array(256 * height * width)   // 1 = ink, 0 = transparent; row-major per glyph
  guidelines: [{ o: "h"|"v", off: int, label: str, color: cssColor }]   // editor-only, see below
  status:     Uint8Array(256)  // 0 = unfinished (default), 1 = WIP, 2 = done; missing => unfinished
}
```

- Index: `data[((code * height) + y) * width + x]`, where `code` is 0–255 and `y` goes top→bottom.
- Per-row bitmask is **derived on demand** (for Verilog export) from the pixel grid — not stored separately.
- `1` = ink (black), `0` = transparent (white/background).
- `guidelines` are **editor-only** helpers (see below): they persist in `localStorage` with the font but are **never** written to PNG or Verilog output.
- `status` is **workflow metadata** (glyph status, see QA): persisted with the font, never exported to any ROM/image format. Absent in old saves ⇒ all unfinished (forward-compatible).

## UI / layout

Black-on-white, monospace UI, terminal-tool aesthetic. **No green/amber.**

- **Left sidebar (persistent):**
  - 16×16 grid of mini-glyphs (the whole atlas). Click to select the active glyph; **Shift-click sets a *reference glyph*** (drawn as a light-gray underlay behind the glyph being edited; Shift-click again clears it). Cells are tinted by glyph status (see QA).
  - Header for the active glyph: `0x41 · A` (hex code + printable char; char shown for `0x20`–`0x7E` only).
  - A jump field: type a hex code (`41`) or a literal char to select.
- **Main pane** with four tabs:
  - **Edit** (default): large editable bitmap of the selected glyph on a grid. Click toggles, drag paints, right-drag erases; undo/redo. Shows hex + char. The reference glyph (if set) is drawn behind the ink.
    - **Guidelines bar** above the canvas: per-font shared H/V guide lines drawn over the glyph (colored, 1px) — ascender/cap/x-height/baseline/descender and left/right width guides. Preset buttons add guides at standard positions; a **lock** (on by default) prevents accidental drags; each guide is removable from its chip in the live list. Guides are shared by all glyphs of the font and are not exported.
  - **Preview**: a large **single-glyph zoom** of the selected glyph (scale, bold, slant, baseline controls, faint cell outline so slant spill is visible) **and** a **multi-line text sample** box driven by markup. An **inverted toggle** switches preview surfaces to white-on-black (how the font will look in a real terminal); editor and sidebar stay black-on-white.
  - **Atlas**: all 256 glyphs in a 16×16 grid (same order as the PNG). **Honors the current bold/slant settings** (with extra column spacing while slant is on, so spill stays legible). Cells are tinted by glyph status (WIP = light peach, unfinished = light pastel blue, done = white). Click selects a glyph; **right-click opens a status menu** (unfinished / WIP / done).
  - **QA**: reports about the font in a **violations table** with a **Refresh** button and a **stale badge** (the report is marked stale as soon as the font changes after the last refresh). First reports: **duplicate glyphs** and **what's left to draw** (status counts + clickable list of unfinished/WIP glyphs). Check set is extensible (see below).
- **Toolbar / file ops:** New (prompts W×H) · Open PNG / BDF · Export PNG / BDF / Verilog · Copy glyph (PNG to clipboard). A **shortcut reference card** (toggle with `?`) lists every keyboard shortcut, rendered from the shortcut registry so it can't drift (see below).

## Modules

The code is split into two files: **`js/core.js`** (pure, DOM-free, exposes global `BF`, unit-testable under `jsc`) and **`js/app.js`** (DOM wiring: canvas, events, file ops). Only `core.js` is covered by headless tests.

| Module | Responsibility |
|--------|----------------|
| model    | `Font` type, pixel get/set, row-bitmask derivation, W/H validation |
| render   | draw a glyph to a canvas/ctx at a scale; artificial-bold overlay; slant (per-row offset); ink-only compositing |
| editor   | Edit tab: grid rendering, pointer→cell mapping, paint/erase, undo/redo |
| preview  | Preview tab: glyph zoom + multi-line sample; markup parser; red-square for undisplayable codes |
| atlas    | Atlas tab: render the full 256 grid (status tints, bold/slant, click/right-click) |
| pngio    | PNG import (atlas→Font) and export (Font→PNG via `<canvas>`) |
| bdfio    | BDF import (first face) and export (Font→BDF, 256 chars) |
| verilog  | Font → `$readmemb` binary text |
| qa       | glyph status, stale-aware reports table, extensible check registry |
| ui       | tab switching, control wiring, toasts, small DOM helpers |
| main     | bootstrap, app state, file ops, localStorage persistence |

## I/O formats

### PNG atlas (import + export)
- 16 columns × 16 rows of glyphs = 256 glyphs.
- **Import:** W = imgWidth ÷ 16, H = imgHeight ÷ 16. **Error if either is not a whole number.**
  - Ink test per pixel: **composite the pixel over white, then luminance < 128 ⇒ ink.** (Handles black-on-white, transparent backgrounds, and light checkerboard cell borders.)
  - Char 0 is top-left; row-major: chars 0–15 on image row 1, 16–31 on image row 2, …
- **Export:** image is exactly `16*W × 16*H` (1px per bit). Ink pixels = black. Background = **white or transparent** (user toggle).

### Verilog `$readmemb` (export)
- One line per glyph row; `width` binary bits per line; total `256 * height` lines.
- Glyph 0 first (its `height` rows, top→bottom), then glyph 1, …
- **Rightmost pixel = MSB** = leftmost character of the line (each visual row is written reversed).
- `1` = ink, `0` = transparent. **No headers, no comments** — raw data only. (Binary by decision — hex export is explicitly out.)

### BDF (import + export)
- The classic X11 bitmap-font text format; a second working format for importing existing fonts (e.g. 3270font derivatives) and for human-readable interchange.
- **Import:** parse the **first face** of a standard single-face BDF (`FONT`, `SIZE`, `BW`, `DH`, `CHARS`, per-char `CODES` + `BITMAP`). W = `BW`, H = `DH`; error on malformed files. Extra faces are ignored. Glyph status/guidelines start fresh on import.
- **Export:** one face, all 256 codes in order, standard fields; BITMAP rows are hex strings, leftmost pixel = MSB (BDF convention). Unlike Verilog, a BDF *may* carry comments — it's a text interchange format, not a ROM.
- **Wiring:** toolbar **Open BDF** (file input, text read, `BF.parseBDF` → new font via `setFont` — status/guidelines reset) and **Export BDF** (`BF.toBDF` → `bitforge-font.bdf`). Malformed file ⇒ error toast, current font untouched.

### Copy glyph to clipboard
- Toolbar **Copy glyph**: rasterizes the *current* glyph to an offscreen canvas at **16 display px per glyph pixel**, black ink on **transparent** background, `toBlob` → PNG.
- If `navigator.clipboard.write` + `ClipboardItem` are available, the PNG goes to the clipboard as an `image/png` `ClipboardItem`; success/failure toasts.
- Otherwise (e.g. `file://` where the clipboard API is unavailable/blocked) it **falls back to a PNG download** (`bitforge-glyph-XX.png`) and says so in a toast.

## Rendering (high level)

- All rendering is Canvas 2D. Glyphs are drawn **ink-only** (black pixels); the background stays transparent/white, so overlapping glyphs compose correctly (ink over anything = ink; we never draw "white").
- **Scale:** integer zoom (≈1×–16×); a glyph pixel becomes a `scale×scale` block.
- **Artificial bold:** draw the glyph, then draw it again offset by **+1px** (in glyph space) horizontally. Ink-only, so the two overlap into a thicker stroke.
- **Slant:** each glyph row is drawn with a horizontal offset. The **baseline** row (selectable, default **line 5 from the bottom**) has offset **0**; rows **above** the baseline get a **non-negative** offset, rows **below** get a **negative** offset. Because glyphs are ink-only, a slanted glyph visually **spills into its neighbours' cells** (intended — this is the cheap slant). The exact offset-per-row math lives in the small `render`/slant module and is finalized during implementation; the contract above is what matters.
- **Effects on the atlas:** the Atlas tab renders every glyph with the *current* bold/slant settings (same state as the Preview tab — no separate controls). While slant is on, extra horizontal spacing is added between columns so slant spill stays legible.
- **Inverted preview:** a toggle switches the *preview surfaces* (glyph zoom, text sample, atlas) to **white-on-black** — how the font will actually look in a terminal. The editor and sidebar selector stay black-on-white (editing clarity, and so pixel-ink mental model stays consistent).
- **Reference glyph underlay:** when a reference glyph is set (Shift-click in the sidebar), the Edit tab draws it **behind** the active glyph in light gray, so variants can be shaped against a base.

## Preview text markup

Input is a plain string; the parser turns it into a styled run of glyphs:
- `*text*` → bold (artificial bold)
- `_text_` → italic (slant)
- Nestable / combining for both (e.g. `*_x_*`).
- `\uXX` → glyph at codepoint `0xXX` (2 hex digits, 0–255), for unprintables.
- **Escapes:** `\*` → literal `*`, `\_` → literal `_` (no toggle); `\\` → literal backslash; unknown `\x` → literal `\` followed by a normal `x` (so a lone/trailing backslash is always a literal).
- Any literally-typed character whose codepoint is **> 255** (or a surrogate pair) → a **red square** the size of a glyph (not in the 8-bit atlas).
- Everything else maps to its own codepoint (0–255).
- **Output:** `parseMarkup(text)` → array of `{ code, bold, italic, ok }`, one item per glyph; `ok=false` (code `-1`) for undisplayable.
- A bare `*`/`_` toggles markup; a **literal** `*`/`_` is typed as `\*`/`\_` (or still `\u2A`/`\u5F`).

## Keyboard shortcuts (registry + reference card)

All keyboard shortcuts go through a single **shortcut registry** in `app.js` — never raw `keydown` listeners for app shortcuts:

```
shortcuts.register({ combo: "Ctrl+ArrowLeft", description: "Shift glyph left", handler(evt) { ... } })
```

- One global dispatcher matches `combo` (simple syntax: `Key`, `Ctrl+Key`, `Alt+Key`, `Ctrl+Shift+Key`, `Alt+Shift+Key`, …; ⌘ counts as Ctrl) and calls `handler`. Shortcuts are **suppressed while a text input has focus** (jump field, preview text) — typing `e` in the char search must not switch tabs.
- **macOS Option quirk:** Option+letter produces an accented character in `evt.key` (Option+N → `∩`), so for Alt combos the dispatcher normalizes the key from the layout-independent `evt.code` (`KeyN` → `n`).
- The **reference card** (toggled with `?`, also a toolbar button) is **rendered from the registry** — it cannot drift from actual behavior because it has no data of its own.
- Existing shortcuts (undo/redo) migrate to the registry; anything added later must be registered or it doesn't exist. **Rule for future agents: new shortcut ⇒ `shortcuts.register()`, full stop.** (See DECISIONS #35.)

Bindings (all via the registry; ⌘ = Ctrl):
- **File ops:** `Alt+N` new font · `Alt+O` open PNG · `Alt+Shift+O` open BDF · `Ctrl+S` export PNG · `Ctrl+Shift+S` export Verilog · `Alt+Shift+S` export BDF. (Ctrl+N / Ctrl+O are reserved by the browser — new window / open file, not interceptable — hence Alt; see DECISIONS #48.)
- **Tabs:** `E` Edit · `P` Preview · `A` Atlas · `Q` QA · `Ctrl+Q` QA tab *and* run the checks.
- **Glyph nav:** `←/→` ±1 · `↑/↓` ±16 (atlas row) · `Home/End` row start/end · `PgUp/PgDn` 0x00/0xFF.
- **Glyph shift:** `Ctrl/⌘+arrows` shift current glyph ±1px (clipped ink is dropped, with a toast if anything was lost; one undo step per shift).
- **Misc:** `Ctrl/⌘+Z` undo · `Ctrl/⌘+Shift+Z` / `Ctrl+Y` redo · `?` reference card.

## Glyph status & QA

- **Status:** each glyph has one of `unfinished` (default) / `wip` / `done`. Stored in the font (`Font.status`), persisted with it, never exported. Assigned in the **Atlas tab** (left-click selects a glyph, **right-click opens a 3-choice status menu**) or from the **Edit tab**'s button group (`unf` / `wip` / `done` in the panel head — for the mark-done-and-move-on workflow). Both paths go through the same `setStatus()`; the Edit-tab buttons highlight the selected glyph's current state. Cells tint by status: WIP = very light peach, unfinished = very light pastel blue, done = plain white (atlas + subtle tint in the sidebar selector).
- **QA tab:** a fourth tab showing reports in a violations table, with a **Refresh** button and a **stale badge**. A monotonic font-version counter is bumped on every font mutation (edit stroke, clear, shift, status change, import, new font); a report remembers the version it was computed at and shows *stale* whenever they differ.
- **Checks are data, not code paths:** each check is a registered function `(font) → rows`, and the table renders whatever is registered. First checks: **duplicate glyphs** (codepoints with identical bitmaps; the all-empty group is excluded as noise before drawing starts) and **what's left to draw** (status counts for 256 and for the printable range, plus a clickable list of unfinished/WIP glyphs that jumps to the glyph).
- **Deferred checks** (documented, not built): edge-ink lint (only once per-glyph *silencing* exists — box-drawing/pseudographic glyphs legitimately touch the edges) and a guideline-violation report (after the QA infra is proven).

## Persistence

- No project file. The in-memory `Font` (glyph data, editor guidelines, **and glyph status**) is auto-saved to `localStorage` so a page reload doesn't lose work. On load: restore if present, else start with a blank default (8×16) font. Saved guidelines are sanitized on load (localStorage is user-editable).
- **Small settings use a dedicated settings API**, not raw `localStorage`: a defaults table + `settings.get(key)` / `settings.set(key, value)` backed by one JSON blob. First persisted settings: preview text, scale, bold, italic, baseline, inverted toggle. **Rule for future agents: new persistable UI value ⇒ add it to the defaults table and use the API** (see DECISIONS #40). The font blob stays on its own path — it's large binary-ish data with its own versioning/sanitizing needs.

## Testing

Pure logic lives in `js/core.js` (no DOM) so it is unit-tested headlessly under macOS JavaScriptCore (`jsc`) — no Node, no browser, no deps. Full guide: [TESTING.md](TESTING.md). See `test/`:
- `run-tests.sh` runs `test/run.js` under jsc; exit 0 = pass, 1 = fail.
- `harness.js` is a tiny `test / assert / assertEqual / assertThrows / __runAll` framework.
- One `test-<module>.js` per module, registered in `run.js`.

DOM-dependent code (render, editor, preview, atlas, pngio canvas I/O) is **not** unit-tested headlessly; it is verified by running `index.html` in a browser. Keep the compute/decision logic in `core.js` so it stays covered.

## Tech constraints

- Vanilla JS, no build, no bundler, no TS, no frameworks, no external libs.
- **No ES modules** — must run from `file://` (classic `<script>`). If files are split, keep to plain scripts that work on `file://`.
- PNG decode/encode via `<img>` + `<canvas>` (`getImageData` / `toBlob` / `toDataURL`) — no PNG library.
