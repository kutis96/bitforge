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
  { version: "0.32.0", date: "2026-11-28", changes: [
    "**Guideline buttons now show/hide guides instead of adding duplicates.** The seven standard guides (`asc`, `cap`, `x`, `base`, `desc`, `L`, `R`) are unique per font and always present — their bar buttons are **visibility toggles** (dimmed while hidden) and never add a guide; `+H`/`+V` still append extra custom guides, freely removable as before. New and imported fonts get any missing standard guides materialized hidden, so the canvas looks exactly as before."
  , "**Hiding a guide is a view state only:** it is not drawn and cannot be dragged, but it still drives the **QA bound checks** and the **TTF baseline** — toggling it changes nothing about the font, the QA report, or the dogfood preview."
  , "Old project files with **duplicate same-name guides** open unchanged: the canonical one (the one the TTF baseline and QA checks have always used) keeps governing, and the extras appear in the guide list with a × for removal."
  ] },
  { version: "0.31.0", date: "2026-11-27", changes: [
    "**Dogfooding now follows guideline changes live:** add, remove or drag a guide (in particular the `base` baseline guide) and the dogfood face rebuilds automatically (debounced, ~400 ms after the last change) — no more toggling dogfooding off/on or redrawing pixels to see the effect on the baseline and line box. Guideline changes also mark the QA report **stale**, since the bounds checks depend on them."
  ] },
  { version: "0.30.0", date: "2026-11-27", changes: [
    "**Export TTF font** (and the dogfooding preview) now sits on the baseline correctly in real apps: the `hhea` table was being written in a layout that doesn't exist in the spec, so strict readers measured a 1.5em line box and a misplaced baseline. The table now uses the canonical layout, with ascent/descent that exactly bound the face (from the baseline guide, or the `H−3` preset when it has none) — matching the `OS/2` values the face already carried."
  , "Also fixed: `head.flags` no longer claims the face starts at x=0 unless it does, and the bundled verifier (`tools/verify-ttf.py`) reads `loca` correctly for bare `.ttf` input and now checks the `hhea` fields a strict renderer relies on."
  ] },
  { version: "0.29.0", date: "2026-11-26", changes: [
    "The `.bitforge` project export is now curated: **Export project (clean)** (`Alt+Shift+P`) writes the font source only — data, name, guidelines, status, QA silences, check props — without personal view prefs, so shared files diff cleanly. **Export project (full)** (`Alt+Shift+F`) keeps everything, as before."
  , "An **Include text sample (clean export)** checkbox under the clean export adds the preview demo text + start glyph to it — for sharing a face as a ready-to-open sample."
  , "Opening `.bitforge` files works exactly as before — clean and sample files simply leave your personal view settings untouched."
  ] },
  { version: "0.28.0", date: "2026-11-26", changes: [
    "The **Preview** tab gained two **dice buttons** (die + pen, die + code) that generate sample text at the cursor: **nonsense prose** — grammatical English made of nonsense words (questions, exclamations, numbers, bracketed asides) — and **plausible code** — a small JavaScript snippet. A quick way to judge a face on real-shaped text without typing anything."
  , "Generated text drops in exactly like typing: it replaces a selection, or appends with a blank line before it when there's already text (cursor lands right after)."
  ] },
  { version: "0.27.8", date: "2026-11-26", changes: [
    "The **New font** dialog now has a **Name** field — name the face as you create it (blank falls back to `font`, the same rule as the Properties dialog; the name flows into the export filenames and the BDF header). The create toast shows the name when given."
  , "Fixed a long-standing spacing issue: the **Changelog** and the startup **What's new** modal's button row now has the same margin as the other dialogs' buttons (it hugged the modal's edge)."
  ] },
  { version: "0.27.7", date: "2026-11-26", changes: [
    "No more browser popups: every \"type a value\" and \"are you sure?\" dialog is now part of the app. **New font** (File \u2192 New blank font, `Alt+N`) asks for width and height in **one form** with a live size readout, instead of a chain of popups; **Copy to codepoint** and the selection's **Paste to codepoint** ask for the target codepoint in one dialog (Enter confirms); and opening a project or a sample now asks in-app before replacing the current font. Invalid input is flagged right in the dialog and it stays open until the value is fixed."
  , "`Esc` now closes the topmost dialog and **keeps your selection** \u2014 before, it could silently clear a selection while a dialog was open."
  ] },
  { version: "0.27.6", date: "2026-11-25", changes: [
    "The Preview tab head grew four controls: **wrap** (off = one long line with scrollbars instead of soft-wrapping), **text box** (hide the input so the render stands alone), **click to add** (double-click a glyph in the left selector to insert its `\\uXX` at the cursor), and a reworked **inverted**.",
    "**Inverted is now relative to the theme:** in the light theme the preview defaults to black-on-white (as before); in the dark theme it defaults to white-on-black, and Inverted flips it to black-on-white. In Auto it follows your system's live light/dark switch. Exports (PNG / BDF / Verilog / TTF) are unaffected and stay black ink."
  ] },
  { version: "0.27.5", date: "2026-11-25", changes: [
    "Editor guidelines now reach both cell edges: a guide's position is valid from `0` (the top/left edge of the glyph) to the full cell size (the bottom/right edge). Drag an unlocked guide to the very edge and it sticks there instead of one pixel short. The editor's outermost grid lines are drawn again — they used to be rendered off-canvas and invisible."
  ] },
  { version: "0.27.4", date: "2026-11-25", changes: [
    "The default sample is now **spcct16** \u2014 spacecat's hand-drawn, full-size, cozy 8\u00d716 face (short descenders) for the yet-unfinished spcct16 FPGA-based computer, slightly modified for Bitforge. It loads on first run (when served) and opens on the glyph **b**; **Small & Cozy** remains available as a sample."
  ] },
  { version: "0.27.3", date: "2026-11-25", changes: [
    "Relabeled the **Open BDF\u2026** and **Export BDF font** badges from **Beta** to **Alpha** (they are not yet tested in other tools); **Export TTF font** and **Dogfood this font** keep their **Beta** badge \u2014 the TTF now passes Chromium's strict OTS validation."
  ] },
  { version: "0.27.2", date: "2026-11-25", changes: [
    "Fixed **Export TTF font** for Windows/Chromium: the generated font now passes Chromium's strict OTS validation (correct table-directory search/range formulas, a spec-conformant OS/2 v4, and the `[0xFFFF, 0xFFFF]` cmap terminator) \u2014 so the TTF, and the live \u201cDogfood this font\u201d preview, load cleanly in Chromium-based browsers, not just on macOS."
  ] },
  { version: "0.27.1", date: "2026-11-24", changes: [
    "The in-app changelog (App \u2192 Changelog\u2026 and the What\u2019s new modal) now renders its **bold** and `inline code` markers instead of showing them literally."
  ] },
  { version: "0.27.0", date: "2026-11-24", changes: [
    "The QA tab's checks can now be configured per font: the **edge-ink** check gained an **ignore** list — tick the edges (top / bottom / left / right) your font reaches on purpose (ROM-tight faces), and ink on those edges stops being reported. The choice is saved with the font (and in \u201c.bitforge\u201d project files) and defaults to none ignored."
  ] },
  { version: "0.26.2", date: "2026-11-24", changes: [
    "Menu layout fix: the long Project items (Open BDF…, Export BDF font, Export TTF font) no longer wrap — the label, **Beta** badge and shortcut hint now sit on one line, and the menu sizes itself to its widest item."
  ] },
  { version: "0.26.1", date: "2026-11-24", changes: [
    "The still-polishing features now wear a small **Beta** badge right next to their menu label: **Dogfood this font**, and **Open BDF…**, **Export BDF font**, **Export TTF font** under the Project menu."
  ] },
  { version: "0.26.0", date: "2026-11-24", changes: [
    "**Dogfood this font** (App menu) — bitforge's own interface now renders in the font you are editing, live: it updates as you draw. Blank characters fall back to the system font per character, and the menu bar itself always stays on the system font, so you can always reach the toggle.",
    "**Project → Export TTF font** (Alt+Shift+T) — exports the font as a real TrueType (.ttf) file for use in web pages or other applications. Blank glyphs are left unmapped on purpose, so other fonts can fill them in.",
    "New tools/verify-ttf.py — a macOS CLI that validates the exported TTF against the system's own font engine (CoreText): loading, metrics, glyph outlines and exact rendering."
  ] },
  { version: "0.25.0", date: "2026-11-23", changes: [
    "The menu bar was rearranged into four menus — **Project** (all file I/O: new/open/import/export), **Font** (properties, resize, live font info), **Glyph** (undo/redo, clear, mirror, copy, status), and **App** (theme, changelog, about) — so it's obvious what each item acts on.",
    "\u201cFile \u2192 Load sample\u2026\u201d is now \u201cProject \u2192 Open sample\u2026\u201d (same action, consistent \u201cOpen \u2026\u201d naming)."
  ] },
  { version: "0.24.0", date: "2026-11-23", changes: [
    "The app now remembers your last selected glyph — reopen it (or open a project/sample that carries it) and you'll land back on that glyph instead of 0x00.",
    "The shipped Small & Cozy sample now opens at \u201cB\u201d (0x42) instead of 0x00."
  ] },
  { version: "0.23.0", date: "2026-11-23", changes: [
    "Dark mode: Edit → Theme: Light / Dark / Auto. Auto (the default) follows your system / browser color preference and updates live when it changes; Light and Dark pin the look regardless of the system. The choice is remembered (and travels inside .bitforge project files).",
    "In Dark, the app chrome, menus and modals go dark, and the editor + glyph selector follow the theme (light ink on dark).",
    "Preview and Atlas render surfaces are unaffected: the existing Inverted checkbox still switches them white-on-black, and exports (PNG / BDF / Verilog) are always black ink on white or transparent, in either theme."
  ] },
  { version: "0.22.1", date: "2026-11-22", changes: [
    "Sample fonts are now served from the server's samples/ folder (listed in samples/manifest.json) instead of being embedded — add, rename or reorder samples by editing that folder, no code change or build step. Shipped with a first real sample: Small & Cozy.",
    "File > Load sample… now only appears when the page is served over http/https; opened straight from a file it's hidden and the app starts blank, as before.",
    "First-run preload of the default sample now only happens on a served page (a saved font still always wins)."
  ] },
  { version: "0.22.0", date: "2026-11-22", changes: [
    "Bundled sample fonts: File → Load sample… lists the samples shipped with this build; loading one replaces the current font (guidelines, glyph statuses and its settings come along).",
    "First run on a clean machine now preloads the default sample font instead of starting blank (a saved font always wins; builds without samples start blank as before).",
    "Sample infrastructure: js/samples.js registry — sample .bitforge files are embedded there, keeping the app file://-safe with no build step."
  ] },
  { version: "0.21.0", date: "2026-11-19", changes: [
    "**Edit**: the selection bar gained a **paste-mode toggle** — `paste: merge` (default: the selection's ink is stamped on top, existing ink is kept) or `paste: replace` (the destination becomes exactly the selection — its transparent parts erase what was there). Applies to move-drag and copy-drag; the choice is remembered.",
    "**Edit**: hold **Ctrl or Alt (Option)** while dragging a selection to **copy** it to a new spot — the original is kept (a plain drag still moves/cuts it). Both honor the paste mode."
  ] },
  { version: "0.20.2", date: "2026-11-18", changes: [
    "Edit: removed the collapsible guidelines bar (rolled back on request) — the bar is always visible again, as before. The 0.20.1 toolbar position/enclosure and the selection-actions fix stay."
  ] },
  { version: "0.20.1", date: "2026-11-18", changes: [
    "Edit: the selection actions now actually hide until a selection is active (a CSS bug left them always visible)."
    , "Edit: toolbar moved below the guidelines bar, with the same enclosure; the right side of the toolbar is the tool's context-sensitive area."
    , "Edit: the guidelines bar is collapsible — a 'guides' toggle folds it to a slim strip; the state is remembered."
  ] },
  { version: "0.20.0", date: "2026-11-18", changes: [
    "Edit: new toolbar — paint (B) / erase / select (S) tools."
    , "Edit: rectangular selection (marquee) with fill (F), clear (X), invert (I), copy to clipboard, copy to another codepoint, and move-by-drag (cut, clipped at the cell edge)."
    , "Edit: Esc deselects (when no menu/modal is open)."
  ] },
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
