# 005 — Glyph "weight" readout / face balance

- **Status:** parked
- **Captured:** 2026-11-26
- **Related:** the QA tab; per-glyph stats like `BF.statusCounts`.

## Motivation

Consistent stroke weight is what makes a monospace face read as one family. A
per-glyph **ink-pixel count** + a face **histogram** would flag glyphs that are
much heavier or lighter than the face average (a "9" drawn too thick, a "1" too
thin). The same machinery could power a **"compare two glyphs"** pixel-diff
overlay for variant work.

## Tradeoffs

- **Not urgent / not clearly needed right now** (user, 2026-11-26).
- Cheap to compute (an ink count is trivial); the open questions are *where* it
  lives (a QA "info" check vs. a readout panel) and how to keep it from being noise.
