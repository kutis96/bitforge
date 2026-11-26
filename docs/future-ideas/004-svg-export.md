# 004 — SVG export / SVG logo render

- **Status:** parked
- **Captured:** 2026-11-26
- **Related:** the other export formats (PNG / BDF / TTF / Verilog) — DECISIONS
  #43 / #82.

## Motivation

A lightweight vector export (each ink pixel → a `<rect>`, or a compact path) would
let the face be viewed in other tools or embedded in docs. A fun corollary: render
one of the sample fonts as an **SVG logo** and drop it into the README in place of
the current text wordmark.

## Tradeoffs

- Low value for the core use case — you lean PNG/Verilog/TTF, and the Verilog ROM
  is already machine-readable and trivially convertible. "Nice enough," not needed.
- Cheap to add if wanted; the **SVG-logo** idea is the most visible payoff.
