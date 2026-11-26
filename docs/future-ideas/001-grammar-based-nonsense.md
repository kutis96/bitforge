# 001 — Grammar-based (SCFG) + length-bounded nonsense text generation

- **Status:** parked
- **Captured:** 2026-11-26
- **Related:** chunk [AD] / DECISIONS #90 — the current template-based generator
  in `js/nonsense.js` (global `BF_NS`) + `test/test-nonsense.js`.

## Motivation

The current `BF_NS.prose(rng)` reads fine but is **template-based**: a word
generator (consonant–vowel syllables → words) plugged into ~17 hand-written
sentence templates. The structures are recognizably repetitive ("…the A N V…",
"…and let the N V on"). A real grammar would (a) produce more *varied,
surprising* sentences via recursive nonterminals, (b) separate **structure**
(grammar) from **lexicon** (nonsense words) so each is testable on its own, and
(c) — the real payoff — make it possible to **constrain** the output (length,
and eventually glyph/content bias), turning the filler into a genuine
**test-text oracle** rather than just a sample generator.

## The idea

Replace/augment the templates with a **stochastic context-free grammar (SCFG)**:
generate a random parse tree by picking a random branch at each node, then
**control the length** so the result stays within a min–max band. The key insight
(from the 2026-11-26 discussion): instead of *backtracking* until a branch fits
the length budget (which re-explores dead ends), **count the valid completions**
and use those counts to guide the walk. Memoized backtracking *is* the counting
DP — counting replaces the search.

## Sketch of approach

A small CFG with recursion (this is where the "natural" variety comes from):

```
S  → NP VP            |  NP VP , CONJ NP VP
NP → DET N            |  DET N PP
PP → PREP NP
VP → V                |  V NP        |  V PP
```

**Length-bounded generation (no backtracking, no dead ends):**
- For each nonterminal `X` and length `ℓ`, compute `ways(X, ℓ)` = the number of
  terminal strings of length exactly `ℓ` that `X` derives. This is a DP over the
  grammar; equivalently a **generating function**: `C_X(z) = Σ ways(X,ℓ)·z^ℓ`. A
  production `X → Y₁…Y_k` contributes the **product** of its children's
  generating functions; `C_S(z)` is then the count of valid sentences by length.
- To emit a sentence of a target length `L`: pick a production weighted by
  `ways(X, L)`, split `L` among the children proportionally to their counts, and
  recurse. Every choice is conditioned on the remaining budget ⇒ you can never
  land in a dead end, and never waste time on a subtree that can't fit.
- **Min–max:** sample the target `L` from `[min, max]` (e.g. proportional to
  `ways(S, L)`, or smoothed toward the middle), then do the exact-`L` sample.
  Sampling over the *union* of the range keeps it loose — nothing over-constrained.

**Grammar hygiene (the gotchas that break the DP):**
- No `ε`-productions (they collapse length and break the length accounting).
- No nonterminal that can derive another nonterminal at the **same** length
  (a zero-progress loop — the DP never terminates).
- Cost is polynomial, roughly `O(productions · budget²)` (a convolution per
  production) — comfortably fine for sentence-length budgets.

## Sibling ideas (same family — worth keeping in mind)

- **Phrase-recall (LZ-style):** stash phrases as they're emitted and add a
  production `NP → RECALL(PREVIOUS)`. Produces *cohesion* ("…the blorft… and,
  as the blorft insisted…") — the thing that makes generated prose feel less
  random. (The "LZ grammar" / dictionary angle is a different sense of "grammar,"
  but it's a lovely fit here.)
- **Two-tier grammar:** a *sentence* grammar under a *discourse* grammar that
  picks moves (open a topic, elaborate, ask a question, aside, close). The
  current "3–7 sentences, one question, one aside" is really a *discourse*
  constraint bolted on as templates; a discourse tier models it first-class.
- **Feature agreement:** carry a feature (e.g. number) through the tree so
  subject/verb agree properly — the current "zabs" heuristic is a poor man's
  version of this.
- **Weighted word choice:** pick the nonsense words from a small n-gram over the
  phonotactic lexicon instead of uniform, so the "nonsense" has a consistent
  flavor.

## Tradeoffs

- **For a font-preview filler: overkill.** The payoff is "slightly more varied
  nonsense"; the current output already reads fine. The DP adds ~100–200 lines
  plus grammar hygiene plus a subtle bug surface (the counting must respect the
  grammar's structure; a cyclic or `ε` grammar silently breaks it).
- **Where it is *not* overkill:** the moment the generator becomes a **test
  oracle** — e.g. "a paragraph with exactly *N* lines to exercise
  line-wrapping," or "text skewed toward a specific glyph set to stress-test
  those glyphs." Length- and content-budgeted sampling is exactly the right tool
  for that. So: don't build it *for the filler*, but it's the correct
  architecture if the generator ever stops being a filler.

## Minimal-but-real version (if we ever do it)

A **weighted finite-state** grammar (drop the deep CFG recursion) + the
length-sampling DP, as a tiny **pure module** with a seeded-`rng` test — real
structure + real length control at a fraction of the SCFG cost. It would slot
straight into the existing convention: a new pure module (global `BF_NS…` or a
sibling), an injectable `rng` for determinism, a `<script src>` in `index.html`
(before `app.js`) + a `load(...)` in `test/run.js`, and a `test/test-*.js` (see
[../TESTING.md](../TESTING.md) and AGENTS.md's "New pure-logic module" rules).
Keep the current template generator as the simple default; the grammar version
is the constrained / powerful mode.
