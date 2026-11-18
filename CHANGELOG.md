# Changelog

All notable changes to bitforge. The in-app changelog (About → Changelog…, and
the “What’s new” modal on version bumps) is rendered from `js/changelog.js` —
**keep both files in sync** (procedure below; design: `docs/DECISIONS.md` #73).

Format: newest first, one section per released version (`0.MINOR.PATCH`).

## How to add an entry (read before touching this file)

One entry per released version, added **in the same commit as the
`BF.VERSION` bump** (per-chunk ritual step 3, [AGENTS.md](AGENTS.md)). Update
**both** files — they must say the same thing:

1. **`js/changelog.js`** (machine-readable source; what the app renders) —
   insert a new object at the **top** of `BF_CHANGELOG`:

   ```js
   { version: "0.18.1", date: "2026-11-18", changes: [
     "One short, user-facing bullet per feature or fix."
   ] },
   ```

   - `version` must equal the new `BF.VERSION` **exactly** — a headless test
     checks this and the suite fails if you bump without adding the entry.
   - `date` = the release date, `YYYY-MM-DD` (use `""` only if genuinely unknown).
   - `changes` = what the **user can observe** — menus, keys, behaviours — not
     implementation detail. 1–5 short bullets.
2. **`CHANGELOG.md`** (this file) — add a matching `## version (date)` section
   directly below this “How to add” section, with the same bullets (markdown
   formatting is fine: backticks, links, menu names).

Rules:

- **Newest first, strictly descending** — a test enforces the ordering.
- **One commit = at most one version bump = one entry.** If a chunk really
  needs two versions, ship them as two commits.
- **Don’t rewrite history.** Old entries describe what shipped; fix genuine
  errors in place (typos), but if behaviour was wrong and later fixed, that
  fix gets its own entry under the new version.
- Run `./test/run-tests.sh` before committing — the changelog data-sanity
  test is the safety net.

## 0.20.0 (2026-11-18)

- **Edit**: new toolbar — `paint` (B) / `erase` / `select` (S) tools.
- **Edit**: rectangular selection (drag a marquee over the cell) with
  `fill` (F), `clear` (X), `invert` (I), `copy` (clipboard PNG),
  `copy to…` (paste the exact pixels into another codepoint at the same
  position), and **move-by-drag** — drag from inside the selection to move
  its contents (a cut: the source is cleared, off-cell ink is clipped).
- **Edit**: `Esc` deselects (when no menu or modal is open).

## 0.19.0 (2026-11-18)

- **Edit**: `Mirror left–right` (H) and `Mirror up–down` (V) — flip the
current glyph, undoable.
- **Edit**: `Copy to codepoint…` (C) — duplicate the current glyph's bitmap to
another codepoint (the target becomes the selection for immediate shaping).
- **QA**: new *empty printable glyphs* check (info, silenceable) — flags
printable codes with no ink (space excepted), and says so extra-loudly if
the glyph is marked **done**.

## 0.18.0 (2026-11-17)

- Changelog: in-app changelog (About → Changelog…) and a “What’s new” modal
  when you run a newer version than before — shows only the changes since
  your last run (semver-aware), with a “Full changelog…” option; the last-run
  version is remembered in localStorage.

## 0.17.1 (2026-11-17)

- The Resize… clip warning now lists every affected glyph (hex + char) with
  the affected-glyph count, so you can check exactly what a lossy crop will
  destroy.

## 0.17.0 (2026-11-16)

- Edit → Resize…: crop or extend the cell by rows/columns at a chosen edge
  (e.g. 8×16 → 9×16 or 6×12); guidelines and the slant baseline shift with
  the content; lossy crops need a confirming second Apply; one full-font undo
  step.

## 0.16.0 (2026-11-16)

- Fonts have a name (Edit → Properties…): it rides in the export filenames and
  the BDF header; imports derive it from the source filename.
- Properties modal shows the name plus live font info (size, ink, status
  counts).

## 0.15.8 (2026-11-16)

- README hero screenshot; project licensed under MIT.

## 0.15.7 (2026-11-16)

- Docs reorganized: root `README.md` (users/developers) and `AGENTS.md`
  (agent handover map).

## 0.15.6 (2026-11-16)

- The reference-glyph selection (Shift-click in the selector) is now
  documented in a caption and tooltip.

## 0.15.5 (2026-11-16)

- File → Copy PNG to clipboard (Alt+Shift+C) and Import PNG from clipboard
  (download fallback where the clipboard API is unavailable).

## 0.15.4 (2026-11-16)

- Fixed the bound-guide QA off-by-one: guide lines are drawn between pixels;
  the bottom/right comparisons now catch the first pixel past the line.

## 0.15.3 (2026-11-15)

- `.bitforge` project file: export/import the whole working state — font,
  guidelines, glyph status, QA silences, and app settings (confirm on import;
  PNG stays the primary exchange format).

## 0.15.2 (2026-11-15)

- Preview: a typed newline now renders as a line break (blank lines kept;
  bold/italic markup state spans lines).

## 0.15.1 (2026-11-15)

- Preview: removed the orphaned bold/italic checkboxes (they no longer had a
  target); the markup note now documents `*bold*`, `_italic_`, `\uXX` and
  backslash escapes.

## 0.14.3 (2026-11-15)

- QA: guideline-violation report — names the crossed guide
  (asc/cap/x/base/desc/L/R) and the overshoot in px.

## 0.14.2 (2026-11-15)

- QA: edge-ink report — glyphs touching the cell edge (warning, silenceable
  per glyph).

## 0.14.1 (2026-11-15)

- QA: per-check status icons (OK / info / warning / silenced), a summary
  strip, per-glyph silencing of warnings, and a show-silenced toggle.

## 0.13.0 (2026-11-15)

- About modal rewritten (“bitmap font editor” framing, credit line);
  `BF.VERSION` introduced and shown in the About head and the browser tab.

## 0.12.8 (2026-11-14)

- About menu with live font info + About bitforge… modal; the W/H corner
  indicator is gone (the size lives in the About menu now).

## 0.12.7 (2026-11-14)

- Status pumping: `D` cycles the current glyph’s status; `Shift+D` marks it
  done and moves to the next glyph.

## 0.12.6 (2026-11-14)

- Preview is now a vertical stack (input above the render; the single-glyph
  zoom is gone — the Edit tab already shows it large); Clear glyph got a
  reddish outline.

## 0.12.5 (2026-11-14)

- Atlas tab gained its own bold / italic / baseline / inverted controls (same
  shared state as the Preview tab, kept in sync both ways).

## 0.12.4 (2026-11-14)

- Desktop-style menu bar: File and Edit dropdowns (mouse-driven); the PNG
  background choice is remembered as a setting.

## 0.12.3 (2026-11-14)

- Edit tab: unfinished / WIP / done status buttons in the panel head.

## 0.12.2 (2026-11-14)

- Preview markup: backslash escapes — `\*` and `\_` for literal
  asterisk/underscore, `\\` for a literal backslash.

## 0.12.1 (2026-11-14)

- Keyboard shortcuts for file ops (Alt-based, so browsers keep their own
  Ctrl combos) and tabs: `E`/`P`/`A`/`Q`, `Ctrl+Q` runs QA.

## 0.11.0 (2026-11-14)

- BDF import/export (X11 bitmap distribution format).
- Copy the current glyph to the clipboard as a PNG (16× scale, transparent;
  downloads if the clipboard is unavailable).

## 0.10.0 (2026-11-14)

- Glyph status (unfinished / WIP / done) with tinted atlas cells.
- QA tab: violations table, Refresh, stale badge; first reports — duplicate
  glyphs and what’s left to draw.

## 0.9.0 (2026-11-14)

- Keyboard navigation (arrows, PageUp/PageDown, Home/End per atlas row).
- Reference glyph: Shift-click a selector cell to underlay it behind the
  glyph you’re editing (diagonal-hatch gray).
- Ctrl/⌘+arrows shift the current glyph’s ink by a pixel.
- Shortcut registry + the `?` reference card (rendered from the registry, so
  it can’t drift).
- Inverted (white-on-black) preview; the Atlas honours bold/slant; settings
  persist across sessions.

## 0.8.0

- Click a mini-glyph in the selector to select it (instead of typing its
  code).

## 0.7.0 (2026-11-14)

- Editor guidelines: per-font horizontal/vertical guides (ascender, cap,
  x-height, baseline, descender, left/right) — presets, drag to move (with a
  lock so you don’t nudge them by accident), remove from the chip list.

## 0.6.0

- The app itself: editor / preview / atlas tabs, PNG atlas + Verilog
  import/export, black-on-white terminal-tool UI.

## 0.5.0

- PNG import ink test: composite over white, luminance < 128 = ink (handles
  transparent backgrounds and light checkerboard cell borders).

## 0.4.0

- Slant: per-row horizontal offset with a selectable baseline (default line 5
  from the bottom); slanted glyphs spill into neighbours (ink-only
  compositing).

## 0.3.0

- Preview markup: `*bold*`, `_italic_` (nestable) and `\uXX` for unprintable
  codepoints; non-8-bit input renders as a red square.

## 0.2.0

- Verilog export: `$readmemb` binary, one line per row, rightmost pixel =
  MSB, glyph 0 first, no headers.

## 0.1.0

- Core font model: 256 glyphs, parametric cell size (default 8×16),
  ink = 1 / transparent = 0, row bitmasks.
