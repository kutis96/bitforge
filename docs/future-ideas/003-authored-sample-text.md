# 003 — Hand-authored preview text for the sample fonts

- **Status:** parked
- **Captured:** 2026-11-26
- **Related:** the sample fonts (`samples/`), the `pvText` setting, and the
  "baked-in sample text" pattern `spcct16-demo` already uses.

## Motivation

A sample should **showcase its own face**. `spcct16-demo` already ships an
authored `pvText` (its preview text is baked in). **Small & Cozy** doesn't have a
hand-written one yet.

## The idea

Write — **by hand**, not the nonsense generator, not spcct16's text — a short,
well-chosen 2–4 line preview for **Small & Cozy**, tuned to that face:
lowercase-heavy (a cozy, lowercase-flavored face), a little uppercase + digits,
one `*bold*` span and one `_italic_` span so the markup actually renders, and a
couple of the punctuation/edge glyphs. Bake it into
`small-and-cozy.bitforge` as its `pvText` (plus a sensible `selCode` start glyph).

## Note

Interacts with the export-split work: `pvText` is a **sample-presentation**
property (see [../FILE-FORMAT.md](../FILE-FORMAT.md)). Samples carry it
deliberately; working fonts needn't. Check what's currently in that sample's
`pvText` first so nothing intentional is clobbered.
