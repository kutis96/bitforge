# 002 — Region stamp (cross-glyph region transfer / in-app clipboard)

- **Status:** parked
- **Captured:** 2026-11-26
- **Related:** the within-glyph selection tools (`BF.rectFill` / `rectInvert` /
  `rectMove` / `rectCopy` + `selCopyTo`) and the copy-to-codepoint flow.

## Motivation

Building a coherent face means **reusing parts** across glyphs ("take the 'a' bowl
into the 'o'") and enforcing **consistency** ("every lowercase gets the same
baseline row", "every capital the same top row"). Today that's manual redrawing or
whole-glyph copy.

## The idea

Copy a **sub-rectangle** (or a whole row/column) of one glyph and **stamp** it onto
another glyph — or a range of codepoints — top-left-aligned. That's the
monospace-consistency workhorse. Much of the core already exists: the selection's
copy-to-codepoint already moves a region between glyphs; the genuinely new pieces
are a clipboard buffer + choosing a destination/range.

## Sketch of approach

- A session **clipboard** holds `{ rect, pixels }` (a rect + its bits, independent
  of any glyph).
- **Paste** = write that rect into a target glyph at an offset, clipped to the
  cell — a new pure fn (e.g. `BF.rectPaste(font, dstCode, origin, clip)`) + tests.
- The 80%-value UX is **stamping**, not free-form placement: copy a rect/row, then
  apply top-left-aligned to a single glyph *or* a codepoint range.

## Tradeoffs

- Core math is cheap (extends the existing selection fns); the fiddliness is
  interactive "drag it exactly here" placement — deliberately **out of scope** for a
  first cut. Worth it when actively shaping a face and wanting reuse/consistency.
