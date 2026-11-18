/*
 * bitforge — changelog data (DECISIONS #73).
 *
 * Machine-readable source for the in-app changelog: the "What's new" modal
 * shown on version bumps and About → Changelog…. Newest first.
 *
 * RULE: bumping BF.VERSION requires adding the matching entry here AND in
 * CHANGELOG.md (the human-readable mirror for the repo) in the same commit.
 * Full procedure: the "How to add an entry" section in CHANGELOG.md.
 * A headless test checks: versions strictly descending, first entry matches
 * BF.VERSION, every entry has at least one change line.
 *
 * Entry shape: { version: "0.17.1", date: "2026-11-17" | "", changes: [ … ] }
 * (date "" = pre-dated history, not shown in the UI)
 */
var BF_CHANGELOG = [
  { version: "0.19.0", date: "2026-11-18", changes: [
    "Edit: Mirror left–right (H) and Mirror up–down (V) — flip the current glyph, undoable."
    , "Edit: Copy to codepoint… (C) — duplicate the current glyph's bitmap to another code (it becomes the selection)."
    , "QA: new 'empty printable glyphs' check (info, silenceable) — flags printable codes with no ink, and notes it if they're marked done."
  ] },
  { version: "0.18.0", date: "2026-11-17", changes: [
    "Changelog: in-app changelog (About → Changelog…) and a “What’s new” modal when you run a newer version than before — shows only the changes since your last run (semver-aware), with a “Full changelog…” option; the last-run version is remembered in localStorage."
  ] },
  { version: "0.17.1", date: "2026-11-17", changes: [
    "The Resize… clip warning now lists every affected glyph (hex + char) with the affected-glyph count, so you can check exactly what a lossy crop will destroy."
  ] },
  { version: "0.17.0", date: "2026-11-16", changes: [
    "Edit → Resize…: crop or extend the cell by rows/columns at a chosen edge (e.g. 8×16 → 9×16 or 6×12); guidelines and the slant baseline shift with the content; lossy crops need a confirming second Apply; one full-font undo step."
  ] },
  { version: "0.16.0", date: "2026-11-16", changes: [
    "Fonts have a name (Edit → Properties…): it rides in the export filenames and the BDF header; imports derive it from the source filename.",
    "Properties modal shows the name plus live font info (size, ink, status counts)."
  ] },
  { version: "0.15.8", date: "2026-11-16", changes: [
    "README hero screenshot; project licensed under MIT."
  ] },
  { version: "0.15.7", date: "2026-11-16", changes: [
    "Docs reorganized: root README.md (users/developers) and AGENTS.md (agent handover map)."
  ] },
  { version: "0.15.6", date: "2026-11-16", changes: [
    "The reference-glyph selection (Shift-click in the selector) is now documented in a caption and tooltip."
  ] },
  { version: "0.15.5", date: "2026-11-16", changes: [
    "File → Copy PNG to clipboard (Alt+Shift+C) and Import PNG from clipboard (download fallback where the clipboard API is unavailable)."
  ] },
  { version: "0.15.4", date: "2026-11-16", changes: [
    "Fixed the bound-guide QA off-by-one: guide lines are drawn between pixels; the bottom/right comparisons now catch the first pixel past the line."
  ] },
  { version: "0.15.3", date: "2026-11-15", changes: [
    ".bitforge project file: export/import the whole working state — font, guidelines, glyph status, QA silences, and app settings (confirm on import; PNG stays the primary exchange format)."
  ] },
  { version: "0.15.2", date: "2026-11-15", changes: [
    "Preview: a typed newline now renders as a line break (blank lines kept; bold/italic markup state spans lines)."
  ] },
  { version: "0.15.1", date: "2026-11-15", changes: [
    "Preview: removed the orphaned bold/italic checkboxes (they no longer had a target); the markup note now documents *bold*, _italic_, \\uXX and backslash escapes."
  ] },
  { version: "0.14.3", date: "2026-11-15", changes: [
    "QA: guideline-violation report — names the crossed guide (asc/cap/x/base/desc/L/R) and the overshoot in px."
  ] },
  { version: "0.14.2", date: "2026-11-15", changes: [
    "QA: edge-ink report — glyphs touching the cell edge (warning, silenceable per glyph)."
  ] },
  { version: "0.14.1", date: "2026-11-15", changes: [
    "QA: per-check status icons (OK / info / warning / silenced), a summary strip, per-glyph silencing of warnings, and a show-silenced toggle."
  ] },
  { version: "0.13.0", date: "2026-11-15", changes: [
    "About modal rewritten (“bitmap font editor” framing, credit line); BF.VERSION introduced and shown in the About head and the browser tab."
  ] },
  { version: "0.12.8", date: "2026-11-14", changes: [
    "About menu with live font info + About bitforge… modal; the W/H corner indicator is gone (the size lives in the About menu now)."
  ] },
  { version: "0.12.7", date: "2026-11-14", changes: [
    "Status pumping: D cycles the current glyph’s status; Shift+D marks it done and moves to the next glyph."
  ] },
  { version: "0.12.6", date: "2026-11-14", changes: [
    "Preview is now a vertical stack (input above the render; the single-glyph zoom is gone — the Edit tab already shows it large); Clear glyph got a reddish outline."
  ] },
  { version: "0.12.5", date: "2026-11-14", changes: [
    "Atlas tab gained its own bold / italic / baseline / inverted controls (same shared state as the Preview tab, kept in sync both ways)."
  ] },
  { version: "0.12.4", date: "2026-11-14", changes: [
    "Desktop-style menu bar: File and Edit dropdowns (mouse-driven); the PNG background choice is remembered as a setting."
  ] },
  { version: "0.12.3", date: "2026-11-14", changes: [
    "Edit tab: unfinished / WIP / done status buttons in the panel head."
  ] },
  { version: "0.12.2", date: "2026-11-14", changes: [
    "Preview markup: backslash escapes — \\* and \\_ for literal asterisk/underscore, \\\\ for a literal backslash."
  ] },
  { version: "0.12.1", date: "2026-11-14", changes: [
    "Keyboard shortcuts for file ops (Alt-based, so browsers keep their own Ctrl combos) and tabs: E/P/A/Q, Ctrl+Q runs QA."
  ] },
  { version: "0.11.0", date: "2026-11-14", changes: [
    "BDF import/export (X11 bitmap distribution format).",
    "Copy the current glyph to the clipboard as a PNG (16× scale, transparent; downloads if the clipboard is unavailable)."
  ] },
  { version: "0.10.0", date: "2026-11-14", changes: [
    "Glyph status (unfinished / WIP / done) with tinted atlas cells.",
    "QA tab: violations table, Refresh, stale badge; first reports — duplicate glyphs and what’s left to draw."
  ] },
  { version: "0.9.0", date: "2026-11-14", changes: [
    "Keyboard navigation (arrows, PageUp/PageDown, Home/End per atlas row).",
    "Reference glyph: Shift-click a selector cell to underlay it behind the glyph you’re editing (diagonal-hatch gray).",
    "Ctrl/⌘+arrows shift the current glyph’s ink by a pixel.",
    "Shortcut registry + the ? reference card (rendered from the registry, so it can’t drift).",
    "Inverted (white-on-black) preview; the Atlas honours bold/slant; settings persist across sessions."
  ] },
  { version: "0.8.0", date: "", changes: [
    "Click a mini-glyph in the selector to select it (instead of typing its code)."
  ] },
  { version: "0.7.0", date: "2026-11-14", changes: [
    "Editor guidelines: per-font horizontal/vertical guides (ascender, cap, x-height, baseline, descender, left/right) — presets, drag to move (with a lock so you don’t nudge them by accident), remove from the chip list."
  ] },
  { version: "0.6.0", date: "", changes: [
    "The app itself: editor / preview / atlas tabs, PNG atlas + Verilog import/export, black-on-white terminal-tool UI."
  ] },
  { version: "0.5.0", date: "", changes: [
    "PNG import ink test: composite over white, luminance < 128 = ink (handles transparent backgrounds and light checkerboard cell borders)."
  ] },
  { version: "0.4.0", date: "", changes: [
    "Slant: per-row horizontal offset with a selectable baseline (default line 5 from the bottom); slanted glyphs spill into neighbours (ink-only compositing)."
  ] },
  { version: "0.3.0", date: "", changes: [
    "Preview markup: *bold*, _italic_ (nestable) and \\uXX for unprintable codepoints; non-8-bit input renders as a red square."
  ] },
  { version: "0.2.0", date: "", changes: [
    "Verilog export: $readmemb binary, one line per row, rightmost pixel = MSB, glyph 0 first, no headers."
  ] },
  { version: "0.1.0", date: "", changes: [
    "Core font model: 256 glyphs, parametric cell size (default 8×16), ink = 1 / transparent = 0, row bitmasks."
  ] }
];
