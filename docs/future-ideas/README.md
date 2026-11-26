# bitforge — future ideas

A backlog of **parked, non-committed ideas** for bitforge. These are
"would be nice / interesting" — **not** decisions (those live in
[../DECISIONS.md](../DECISIONS.md)), **not** scheduled work, and **not**
requirements. Each idea is written so a future agent (or the user) can pick it
up cold and understand the *why*, the shape of the approach, the tradeoffs, and
what "doing it" would require.

## How to add an idea

1. Create `NNN-<kebab-slug>.md` in this folder — `NNN` is a zero-padded 3-digit
   number, the **next free number in order of capture** (001, 002, …). The
   number is a stable id: never renumber, reuse, or rename it once created.
2. Fill in the **template** below (the file itself is the record of thinking).
3. Add a row to the **Index** table.
4. Commit as a docs-only change (`bitforge [docs]: add future idea NNN — <title>`)
   — **no version bump, no changelog entry** (this is not a functional chunk).

## Index

| #   | Idea | Status |
|-----|------|--------|
| [001](001-grammar-based-nonsense.md) | Grammar-based (SCFG) + length-bounded nonsense text generation | parked |

## Statuses

- **parked** — interesting, not planned. (default)
- **under consideration** — the user is weighing doing it; expect it to become a real chunk soon.
- **done** — implemented; link the chunk + DECISIONS entry, keep the file as a record of the original thinking.

## Template (copy for a new idea)

```
# NNN — <short title>

- **Status:** parked
- **Captured:** YYYY-MM-DD
- **Related:** (DECISIONS # / chunk [X] / current files)

## Motivation
Why this, and why the current approach (if any) isn't quite enough.

## The idea
The concept, concrete enough to understand at a glance.

## Sketch of approach
How it would likely work. Pseudocode / a small example is welcome; full code is not.

## Tradeoffs
Cost, risk, and the honest "overkill?" take — and *when it would be worth it*.

## Minimal version
The smallest real slice that captures most of the value.
```
