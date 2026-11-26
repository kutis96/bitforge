# bitforge — file formats

Reference for the file formats bitforge reads and writes. The **`.bitforge`
project file** is documented in full here (it's the work-in-progress snapshot and
the one with the many terse property names); the interchange/export formats are
summarized and cross-linked to where their rules are locked.

> **Status note:** the *export modes* section below (clean / sample / full) is
> **implemented** (0.29.0, DECISIONS #91) — the mode split is a write-side
> curation; it changes nothing about how files are read (see
> [Backwards compatibility](#backwards-compatibility)).

---

## The `.bitforge` project file

### Purpose

A **WIP snapshot** — the font plus the things a PNG can't carry. **PNG remains the
primary interchange format for finished fonts**; the project file is for working
state. It's plain JSON, human-readable, and meant to be diff-friendly (see the
[export modes](#export-modes-clean-sample-full) below).

### Top-level structure

```jsonc
{
  "app":     "bitforge",      // fixed
  "kind":    "font-project",  // fixed
  "version": 1,               // format version (this build reads 1)
  "font":    { /* the font blob — see below */ },
  "settings": { /* optional — the app's settings, see below */ }
}
```

The `font` blob and the `localStorage` blob are the **same shape** (one
serializer, `BF.fontToBlob` / `BF.fontFromBlob`).

### Property matrix (searchable index)

`clean` / `sample` / `full` = the three export modes (0.29.0; see
[Export modes](#export-modes-clean-sample-full)). **✓** = property is written;
**–** = omitted (on import, an omitted property keeps the app's current value or
its default).

| Key | Where | Meaning (brief) | clean | sample | full | Details |
|-----|-------|-----------------|:-----:|:------:|:----:|---------|
| `w` | font | cell width (px) | ✓ | ✓ | ✓ | [#w](#w) |
| `h` | font | cell height (px) | ✓ | ✓ | ✓ | [#h](#h) |
| `d` | font | the 256 glyph bitmaps (row-major) | ✓ | ✓ | ✓ | [#d](#d) |
| `n` | font | face name | ✓ | ✓ | ✓ | [#n](#n) |
| `g` | font | editor guidelines | ✓ | ✓ | ✓ | [#g](#g) |
| `s` | font | per-glyph status (unf/wip/done) | ✓ | ✓ | ✓ | [#s](#s) |
| `si` | font | per-glyph QA silences | ✓ | ✓ | ✓ | [#si](#si) |
| `cp` | font | per-check QA properties | ✓ | ✓ | ✓ | [#cp](#cp) |
| `r` | font | reference glyph (**proposed** — not yet in the blob) | ✓¹ | ✓¹ | ✓¹ | [#r](#r) |
| `selCode` | settings | start/last-selected glyph | – | ✓ | ✓ | [#selcode](#selcode) |
| `pvText` | settings | preview sample text | – | ✓ | ✓ | [#pvtext](#pvtext) |
| `pngBg` | settings | last PNG export background | – | – | ✓ | [#pngbg](#pngbg) |
| `pvScale` | settings | preview zoom | – | – | ✓ | [#pvscale](#pvscale) |
| `pvBold` | settings | preview bold | – | – | ✓ | [#pvbold](#pvbold) |
| `pvItalic` | settings | preview italic | – | – | ✓ | [#pvitalic](#pvitalic) |
| `pvBaseline` | settings | slant baseline row | – | – | ✓ | [#pvbaseline](#pvbaseline) |
| `inverted` | settings | invert preview surfaces | – | – | ✓ | [#inverted](#inverted) |
| `qaShowSilenced` | settings | QA: show silenced rows | – | – | ✓ | [#qashowsilenced](#qashowsilenced) |
| `pasteMode` | settings | selection paste blend | – | – | ✓ | [#pastemode](#pastemode) |
| `theme` | settings | UI theme | – | – | ✓ | [#theme](#theme) |
| `dogfood` | settings | render UI in this font | – | – | ✓ | [#dogfood](#dogfood) |
| `pvShowText` | settings | show the preview text box | – | – | ✓ | [#pvshowtext](#pvshowtext) |
| `pvWrap` | settings | preview soft-wrap | – | – | ✓ | [#pvwrap](#pvwrap) |
| `pvInsert` | settings | click-to-add glyph | – | – | ✓ | [#pvinsert](#pvinsert) |

¹ **`r`** is still *proposed* (not yet written — the reference glyph is
session-only today): ✓ means “included in all three modes **once it exists**” —
the exporter serializes the whole font blob, so it would ride along automatically.
See [#r](#r).

### Property details

<a name="w"></a>**`w`** — cell **width** in pixels. Integer, `1..1024` (soft
range ~1–64). One of the two things that define the face. (DECISIONS #4)

<a name="h"></a>**`h`** — cell **height** in pixels. Same constraints as `w`.
Default 8×16. (DECISIONS #4)

<a name="d"></a>**`d`** — the **glyph data**: a flat array of `0`/`1`, length
`w·h·256`. Glyph 0 first, then glyph 1, … glyph 255. Within a glyph, row-major,
top row first. `1` = ink (black), `0` = transparent. (DECISIONS #6)

<a name="n"></a>**`n`** — the face **name**. Printable ASCII (0x20–0x7E), ≤ 64
chars, trimmed. Flows into export filenames and the BDF header. Missing/invalid
→ `font`. (DECISIONS #70)

<a name="g"></a>**`g`** — **editor guidelines**: an array of
`{ o: "h"|"v", off, label, color }`. `o` = orientation; `off` = the grid boundary
**between** pixels, valid `0..dim` inclusive (0 = near cell edge, `dim` = far
edge); `label`/`color` for display. Editor-only, never exported to ROM/image.
(DECISIONS #28, #86)

<a name="s"></a>**`s`** — **per-glyph status**: an array of 256 values,
`0`=unfinished, `1`=wip, `2`=done. Workflow metadata; never exported to
ROM/image. (DECISIONS #38)

<a name="si"></a>**`si`** — **per-glyph QA silences**: `{ checkId: { code: true } }`.
Which QA checks are silenced on which glyphs (e.g. edge-ink on a box-drawing
glyph). Only check ids the current build knows survive (unknown ids dropped on
load). (DECISIONS #59)

<a name="cp"></a>**`cp`** — **per-check QA properties**, e.g.
`{ edge: { ignoreEdges: ["top","bottom"] } }` (the edge-ink check's
ignore-edges mask). Per-font, validated per known check id on load.
(DECISIONS #83)

<a name="r"></a>**`r`** — **reference glyph** (proposed, not yet in v1): the code
of the base glyph to draw as a gray underlay behind the active one (DECISIONS #33,
currently session-only). To be added as an **additive optional** field
(`0..255` or absent), riding the blob like `g`/`s`. Included in all three modes.

<a name="selcode"></a>**`selCode`** — **start / last-selected glyph** (`0..255`).
Where the app opens / where you left off. A sample uses it to open on a
showcase glyph. (DECISIONS #80)

<a name="pvtext"></a>**`pvText`** — the **preview sample text** (a string, may
contain the preview markup). A sample uses it to showcase the face. (DECISIONS #20)

<a name="pngbg"></a>**`pngBg`** — last **PNG export background**: `"solid"` (white)
or `"transparent"`. Remembered so `Ctrl+S` reuses it. A user export-workflow pref,
not font data. (DECISIONS #8)

<a name="pvscale"></a>**`pvScale`** — preview **zoom** (integer, ~1–16). View pref.

<a name="pvbold"></a>**`pvBold`** — preview **bold** (artificial 1px double-strike).
A render mode, not font data. (DECISIONS #10)

<a name="pvitalic"></a>**`pvItalic`** — preview **italic** (cheap slant). A render
mode. (DECISIONS #11)

<a name="pvbaseline"></a>**`pvBaseline`** — the **slant baseline row** (offset from
the bottom, default 5). A render-mode parameter. (DECISIONS #11)

<a name="inverted"></a>**`inverted`** — **invert the preview surfaces** (relative to
the theme). Purely visual. (DECISIONS #36, #87)

<a name="qashowsilenced"></a>**`qaShowSilenced`** — QA tab: **show silenced rows** in
the report table. A view pref. (DECISIONS #59)

<a name="pastemode"></a>**`pasteMode`** — selection **paste blend**: `"merge"` (keep
existing ink) or `"replace"`. An editing-workflow pref. (DECISIONS #76)

<a name="theme"></a>**`theme`** — UI **theme**: `"light" | "dark" | "auto"` (auto
follows the system). A user/environment preference, not per-font. (DECISIONS #79)

<a name="dogfood"></a>**`dogfood`** — **render bitforge's UI in the font being
edited** (live). A preview toggle. (DECISIONS #82)

<a name="pvshowtext"></a>**`pvShowText`** — Preview: **show the text box** + markup
note. A view pref. (DECISIONS #87)

<a name="pvwrap"></a>**`pvWrap`** — Preview: **soft-wrap** long lines (off = one long
row + scrollbars). A view pref. (DECISIONS #87)

<a name="pvinsert"></a>**`pvInsert`** — Preview: **click-to-add** (double-click a
selector glyph to insert its `\uXX`). A view pref. (DECISIONS #87)

### Export modes (clean / sample / full) — implemented in 0.29.0 (DECISIONS #91)

The `.bitforge` is treated as **source code**: by default it should carry the
font + its design state, not a grab-bag of ephemeral view prefs (which create
noisy diffs). The export picks which properties to write:

- **clean** — the shareable **font source**: the `font` blob (`w,h,d,n,g,s,si,cp`)
  only, **no `settings` key**. The **source-control** default —
  **Export project (clean)…** (`Alt+Shift+P`).
- **sample** — clean **+** the sample-presentation settings (`selCode`, `pvText`).
  For sample files. Exposed as the **Include text sample (clean export)**
  checkbox in the Project menu (directly under the clean export;
  `cleanPresentation` setting, default off): with it on, a clean export is
  exactly a sample.
- **full** — **everything** (all 16 settings, personal) — the pre-0.29.0
  behavior — **Export project (full)…** (`Alt+Shift+F`).

Both menu items download `<font name>.bitforge`. `projectExportText()` /
`exportProject()` called **without** a mode default to **clean** (the source
default); an unknown mode degrades to clean.

**Single source of truth:** `SAMPLE_SETTINGS = ["selCode", "pvText"]` (app.js)
declares the clean/sample boundary, and `exportProjectSettings(mode)` is the one
curation point — the matrix above documents that declaration, not a second
literal list (the project's "one list" convention, like `qaChecks` and the
shortcut registry).

**Profiles:** a *bounded* extension (a fixed set of property-**group** toggles) is
a possible later refinement if the three presets aren't enough. **Arbitrary
user-defined profiles: rejected** as too far (user-agreed, 2026-11-26).

### Backwards compatibility

A hard requirement: **the app must keep reading existing `.bitforge` files.**

- **Reading is unchanged and tolerant.** `BF.objFromProject` checks `app`/`kind`
  and that `version` matches (1); `BF.fontFromBlob` is tolerant — a **missing**
  field falls back to its default (or keeps the app's current value for settings),
  and an **unknown** field is ignored. So:
  - old files (which carry *all* settings) still read;
  - new **clean**/**sample** files (which **omit** view prefs) read fine — an
    omitted setting keeps the app's current value or its default (this is exactly
    the desired "partial override" behavior);
  - the split is therefore a **write-side curation only** — no breaking format
    change to the reader.
- **New fields are additive & optional.** e.g. the reference glyph `r` (and any
  future property) is added as an optional key: old readers ignore it, new readers
  default it. Pre-1.0 additions follow the `name` precedent (DECISIONS #70) —
  documented, no version bump required.

---

## Other formats (summary)

These are **export/interchange** formats with their rules locked elsewhere — this
is the pointer, not the spec.

| Format | Direction | What it is | Spec |
|--------|-----------|-----------|------|
| **PNG atlas** | import + export | 16×16 grid of cells, 1px/bit; `16W × 16H`; ink=black, bg white/transparent. **Primary interchange for finished fonts.** | DECISIONS #5, #7, #8 · [DESIGN.md](DESIGN.md#io-formats) |
| **Verilog `$readmemb`** | export only | binary, one line per row, rightmost pixel = MSB, glyph 0 first, `256·h` lines, no comments. | DECISIONS #9 |
| **BDF** | import (first face) + export | a standard X11 BDF face; hex BITMAP rows, leftmost = MSB. *Alpha.* | DECISIONS #43 |
| **TrueType (`.ttf`)** | export only | a minimal single-face TTF built from the atlas (blank codes unmapped ⇒ per-codepoint fallback). *Beta* — known baseline-metrics limitation (see the [TTF fix](#) near-term item). | DECISIONS #82, #85 |

## Cross-references

- Project-file decision: **DECISIONS #64** · settings API: **#40** · name: **#70** ·
  guidelines: **#28/#86** · check properties: **#83** · theme: **#79** ·
  last-selected glyph: **#80** · dogfooding: **#82** · preview controls: **#87**.
- Parked idea that touches these formats: [future-ideas/003](future-ideas/003-authored-sample-text.md)
  (sample text).
