# bitforge — Design

Broad design. Implementation details are intentionally deferred — this describes *what* the app is and *how the pieces fit together*, not *how every function works*.

## Goals

- Edit a 256-glyph, fixed-size, monospaced bitmap font (black/white).
- Parametric glyph size W×H per font (default **8 wide × 16 tall**).
- Live preview: single-glyph zoom + multi-line text sample, selectable scale, per-character **bold** / **italic (slant)** attributes.
- Render "terminal" effects: **artificial bold** (double-draw, 1px offset) and **slant** (per-row horizontal offset).
- Import/export a PNG atlas; export a Verilog `$readmemb` ROM.

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
}
```

- Index: `data[((code * height) + y) * width + x]`, where `code` is 0–255 and `y` goes top→bottom.
- Per-row bitmask is **derived on demand** (for Verilog export) from the pixel grid — not stored separately.
- `1` = ink (black), `0` = transparent (white/background).
- `guidelines` are **editor-only** helpers (see below): they persist in `localStorage` with the font but are **never** written to PNG or Verilog output.

## UI / layout

Black-on-white, monospace UI, terminal-tool aesthetic. **No green/amber.**

- **Left sidebar (persistent):**
  - 16×16 grid of mini-glyphs (the whole atlas). Click to select the active glyph.
  - Header for the active glyph: `0x41 · A` (hex code + printable char; char shown for `0x20`–`0x7E` only).
  - A jump field: type a hex code (`41`) or a literal char to select.
- **Main pane** with three tabs:
  - **Edit** (default): large editable bitmap of the selected glyph on a grid. Click toggles, drag paints, right-drag erases; undo/redo. Shows hex + char.
    - **Guidelines bar** above the canvas: per-font shared H/V guide lines drawn over the glyph (colored, 1px) — ascender/cap/x-height/baseline/descender and left/right width guides. Preset buttons add guides at standard positions; a **lock** (on by default) prevents accidental drags; each guide is removable from its chip in the live list. Guides are shared by all glyphs of the font and are not exported.
  - **Preview**: a large **single-glyph zoom** of the selected glyph (scale, bold, slant, baseline controls, faint cell outline so slant spill is visible) **and** a **multi-line text sample** box driven by markup.
  - **Atlas**: all 256 glyphs in a 16×16 grid (same order as the PNG).
- **Toolbar / file ops:** New (prompts W×H) · Open PNG · Export PNG · Export Verilog.

## Modules

The code is split into two files: **`js/core.js`** (pure, DOM-free, exposes global `BF`, unit-testable under `jsc`) and **`js/app.js`** (DOM wiring: canvas, events, file ops). Only `core.js` is covered by headless tests.

| Module | Responsibility |
|--------|----------------|
| model    | `Font` type, pixel get/set, row-bitmask derivation, W/H validation |
| render   | draw a glyph to a canvas/ctx at a scale; artificial-bold overlay; slant (per-row offset); ink-only compositing |
| editor   | Edit tab: grid rendering, pointer→cell mapping, paint/erase, undo/redo |
| preview  | Preview tab: glyph zoom + multi-line sample; markup parser; red-square for undisplayable codes |
| atlas    | Atlas tab: render the full 256 grid |
| pngio    | PNG import (atlas→Font) and export (Font→PNG via `<canvas>`) |
| verilog  | Font → `$readmemb` binary text |
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
- `1` = ink, `0` = transparent. **No headers, no comments** — raw data only.

## Rendering (high level)

- All rendering is Canvas 2D. Glyphs are drawn **ink-only** (black pixels); the background stays transparent/white, so overlapping glyphs compose correctly (ink over anything = ink; we never draw "white").
- **Scale:** integer zoom (≈1×–16×); a glyph pixel becomes a `scale×scale` block.
- **Artificial bold:** draw the glyph, then draw it again offset by **+1px** (in glyph space) horizontally. Ink-only, so the two overlap into a thicker stroke.
- **Slant:** each glyph row is drawn with a horizontal offset. The **baseline** row (selectable, default **line 5 from the bottom**) has offset **0**; rows **above** the baseline get a **non-negative** offset, rows **below** get a **negative** offset. Because glyphs are ink-only, a slanted glyph visually **spills into its neighbours' cells** (intended — this is the cheap slant). The exact offset-per-row math lives in the small `render`/slant module and is finalized during implementation; the contract above is what matters.

## Preview text markup

Input is a plain string; the parser turns it into a styled run of glyphs:
- `*text*` → bold (artificial bold)
- `_text_` → italic (slant)
- Nestable / combining for both (e.g. `*_x_*`).
- `\uXX` → glyph at codepoint `0xXX` (2 hex digits, 0–255), for unprintables.
- Any literally-typed character whose codepoint is **> 255** (or a surrogate pair) → a **red square** the size of a glyph (not in the 8-bit atlas).
- Everything else maps to its own codepoint (0–255).
- **Output:** `parseMarkup(text)` → array of `{ code, bold, italic, ok }`, one item per glyph; `ok=false` (code `-1`) for undisplayable.
- A bare `*`/`_` toggles markup; a **literal** `*`/`_` is typed as `\u2A`/`\u5F`.

## Persistence

- No project file. The in-memory `Font` (glyph data **and** editor guidelines) is auto-saved to `localStorage` so a page reload doesn't lose work. On load: restore if present, else start with a blank default (8×16) font. Saved guidelines are sanitized on load (localStorage is user-editable).

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
