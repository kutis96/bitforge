# 006 — Holes & connectivity QA (likely out of scope for bitforge)

- **Status:** parked — **likely out of scope for bitforge** (a full *large*-font
  editor is the natural home)
- **Captured:** 2026-11-26
- **Related:** the QA tab; would be a pure-core flood-fill / connected-components
  check.

## The idea

Report per glyph "N disconnected components / M enclosed counters" — catching
classic bitmap bugs: a "0"/"9"/"4"/"o" with a counter accidentally closed, a
broken stroke, a "1" that should be one piece.

## Why it's parked for bitforge

At small cell sizes (8×16), "is that connected, or a stylistic choice?" is a human,
artistic judgment, and "holes" are less meaningful — a checker here would produce
**noise, not signal**. Dropped for bitforge (user, 2026-11-26), but it's a
genuinely useful lint for a full-featured bitmap-font tool. Kept here so it isn't
lost.
