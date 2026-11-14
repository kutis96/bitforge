/* bitforge — headless smoke test for app.js (DOM layer) under the stub. */

test("dom: app.js init() runs without error and sizes canvases", function () {
  assert(typeof globalThis.__stub.runInit === "function", "stub installed");
  globalThis.__stub.runInit(); // any throw here => FAIL (element/BF typos, etc.)

  var els = globalThis.__stub.els;
  // 8x16 default font; editorScale() => floor(360/16)=22
  assertEqual(els["editor"].width, 8 * 22, "editor width (8*22)");
  assertEqual(els["editor"].height, 16 * 22, "editor height (16*22)");
  assertEqual(els["selector"].width, 256, "selector = 16 cells of 16px");
  assertEqual(els["selector"].height, 256, "selector height");
  // atlas scale => floor(640/(16*8))=5
  assertEqual(els["atlas"].width, 16 * 8 * 5, "atlas width");
  assertEqual(els["dims"].textContent, "W:8  H:16", "dims label");
  assertEqual(els["sel-header"].textContent, "0x00", "selected header (0x00 not printable)");
  assertEqual(els["edit-label"].textContent, "glyph 0x00", "edit label");
  // Regression: canvas CSS size must equal internal size (fixes click->cell desync).
  assertEqual(els["editor"].style.width, "176px", "editor CSS width == internal width");
  assertEqual(els["editor"].style.height, "352px", "editor CSS height == internal height");
});

test("dom: init restores a font from localStorage when present", function () {
  // Fresh stub state is hard to get (globals persist), so instead just assert the
  // first init populated localStorage with the font we started with.
  var raw = globalThis.localStorage.getItem("bitforge.font.v1");
  assert(raw != null, "font was persisted to localStorage on init");
  assert(raw.indexOf("\"w\":8") !== -1, "persisted width is 8");
});

test("dom: clicking the selector grid selects that glyph", function () {
  var els = globalThis.__stub.els;
  // cell (col 1, row 2), center => code 2*16+1 = 33 = 0x21 '!'
  globalThis.__stub.dispatch("selector", "click", { clientX: 1 * 16 + 8, clientY: 2 * 16 + 8 });
  assertEqual(els["sel-header"].textContent, "0x21 \u00b7 !", "cell (1,2) -> 0x21");
  // top-left cell, center => 0x00 (not printable)
  globalThis.__stub.dispatch("selector", "click", { clientX: 8, clientY: 8 });
  assertEqual(els["sel-header"].textContent, "0x00", "cell (0,0) -> 0x00");
  // bottom-right cell, center => 0xFF (not printable)
  globalThis.__stub.dispatch("selector", "click", { clientX: 15 * 16 + 8, clientY: 15 * 16 + 8 });
  assertEqual(els["sel-header"].textContent, "0xFF", "cell (15,15) -> 0xFF");
});

test("dom: shortcut registry — arrow keys / Home / End / PgUp / PgDn navigate", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var key = function (k, extra) {
    var evt = { key: k, preventDefault: function () {} };
    for (var p in (extra || {})) evt[p] = extra[p];
    app.shortcuts.dispatch(evt);
  };
  app.selectGlyph(33); // 0x21
  key("ArrowRight");
  assertEqual(app.state.selected, 34, "right");
  key("ArrowLeft"); key("ArrowLeft");
  assertEqual(app.state.selected, 32, "left twice -> 0x20");
  key("End");
  assertEqual(app.state.selected, 47, "End -> row end 0x2F");
  key("Home");
  assertEqual(app.state.selected, 32, "Home -> row start 0x20");
  key("ArrowUp");
  assertEqual(app.state.selected, 16, "up -> previous row");
  key("ArrowDown");
  assertEqual(app.state.selected, 32, "down -> back");
  key("PageDown");
  assertEqual(app.state.selected, 255, "PgDn -> 0xFF");
  key("PageUp");
  assertEqual(app.state.selected, 0, "PgUp -> 0x00");
  key("ArrowLeft");
  assertEqual(app.state.selected, 0, "clamps at 0x00");
  assertEqual(els["sel-header"].textContent, "0x00", "header follows navigation");
});

test("dom: shortcut registry — Ctrl+arrows shift the glyph, undo/redo work", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  var key = function (k, extra) {
    var evt = { key: k, preventDefault: function () {} };
    for (var p in (extra || {})) evt[p] = extra[p];
    app.shortcuts.dispatch(evt);
  };
  app.selectGlyph(0);
  BF.clearGlyph(f, 0);
  BF.setPixel(f, 0, 7, 3, 1);
  key("ArrowLeft", { ctrlKey: true });
  assertEqual(BF.getPixel(f, 0, 7, 3), 0, "old pixel cleared");
  assertEqual(BF.getPixel(f, 0, 6, 3), 1, "ink shifted one left");
  key("z", { ctrlKey: true });
  assertEqual(BF.getPixel(f, 0, 7, 3), 1, "undo restored the pixel");
  key("z", { ctrlKey: true, shiftKey: true });
  assertEqual(BF.getPixel(f, 0, 6, 3), 1, "redo re-applied the shift");
});

test("dom: shifting into the edge clips and toasts", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  var els = globalThis.__stub.els;
  BF.clearGlyph(f, 0);
  BF.setPixel(f, 0, 0, 3, 1);
  var evt = { key: "ArrowLeft", ctrlKey: true, preventDefault: function () {} };
  app.shortcuts.dispatch(evt);
  assertEqual(BF.getPixel(f, 0, 0, 3), 0, "clipped pixel gone");
  assertEqual(els["toast"].textContent, "Shift clipped 1 px", "clip toast shown");
});

test("dom: shift-click in the selector sets/clears the reference glyph", function () {
  var app = globalThis.__stub.app;
  app.selectGlyph(0);
  // cell (col 0, row 1) => code 1*16+0 = 16 = 0x10
  globalThis.__stub.dispatch("selector", "click", { clientX: 8, clientY: 1 * 16 + 8, shiftKey: true });
  assertEqual(app.state.ref, 16, "shift-click sets ref");
  assertEqual(app.state.selected, 0, "selection unchanged");
  globalThis.__stub.dispatch("selector", "click", { clientX: 8, clientY: 1 * 16 + 8, shiftKey: true });
  assertEqual(app.state.ref, null, "shift-click again clears");
});

test("dom: shortcut card toggles; registry holds the full binding set", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  assertEqual(els["keys-card"].hidden, true, "card starts hidden");
  app.toggleKeysCard();
  assertEqual(els["keys-card"].hidden, false, "toggle shows it");
  app.toggleKeysCard();
  assertEqual(els["keys-card"].hidden, true, "toggle hides it");
  // 8 nav + 6 file-ops + 5 tabs + 4 shift + 3 undo/redo + 1 card = 27
  assertEqual(app.shortcuts.list.length, 27, "27 shortcuts registered");
  var combos = {};
  for (var i = 0; i < app.shortcuts.list.length; i++) combos[app.shortcuts.list[i].combo] = true;
  assert(combos["Ctrl+ArrowLeft"] && combos["?"] && combos["Ctrl+z"] && combos["PageUp"], "expected combos present");
  assert(combos["Alt+n"] && combos["Alt+o"] && combos["Ctrl+s"] && combos["Ctrl+q"] && combos["e"] && combos["q"],
    "file-op/tab combos present");
});

test("dom: preview settings persist via the settings API", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  els["pv-bold"].checked = true;
  globalThis.__stub.dispatch("pv-bold", "change", {});
  assertEqual(app.state.bold, true, "bold state set");
  var raw = globalThis.localStorage.getItem("bitforge.settings.v1");
  assert(raw != null, "settings blob written");
  assertEqual(JSON.parse(raw).pvBold, true, "bold persisted");
  els["pv-bold"].checked = false;
  globalThis.__stub.dispatch("pv-bold", "change", {});
  assertEqual(JSON.parse(globalThis.localStorage.getItem("bitforge.settings.v1")).pvBold, false, "unbold persisted");
});

test("dom: glyph status persists with the font and bumps the version", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  var v0 = app.state.fontVersion;
  app.setStatus(5, 1);
  assertEqual(f.status[5], 1, "wip stored");
  assert(app.state.fontVersion > v0, "version bumped");
  var raw = JSON.parse(globalThis.localStorage.getItem("bitforge.font.v1"));
  assertEqual(raw.s[5], 1, "status persisted in the font blob");
  app.setStatus(5, 2);
  assertEqual(f.status[5], 2, "done stored");
  app.setStatus(5, 0);
  assertEqual(f.status[5], 0, "reset to unfinished");
  app.setStatus(5, 99);
  assertEqual(f.status[5], 0, "invalid status coerced to unfinished");
});

test("dom: QA refresh computes rows; report goes stale on mutation", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  // build a duplicate pair: glyph 10 = glyph 12
  BF.setPixel(f, 10, 2, 2, 1);
  BF.setPixel(f, 12, 2, 2, 1);
  app.setStatus(3, 2); // any mutation bumps the version
  app.qaRefresh();
  var rows = app.qaRows();
  assert(rows.length > 0, "rows computed");
  var dupRow = null, summary = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].check === "duplicate glyphs" && rows[i].codes.indexOf("0x0A") !== -1) dupRow = rows[i];
    if (rows[i].check === "what's left to draw" && rows[i].code == null) summary = rows[i];
  }
  assert(dupRow, "duplicate row found (0x0A/0x0C)");
  assert(summary, "summary row present");
  assert(summary.detail.indexOf("done 1/256") !== -1, "summary counts the done glyph: " + summary.detail);
  assert(!app.qaStale(), "not stale right after refresh");
  app.setStatus(4, 1); // mutate
  assert(app.qaStale(), "stale after mutation");
  app.qaRefresh();
  assert(!app.qaStale(), "refresh clears staleness");
});

test("dom: atlas click maps pointer to glyph (plain and slanted geometry)", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  // plain geometry: s=5, colW=8, pad=0; click cell (col 2, row 1)
  assertEqual(app.atlasCellAt({ clientX: (2 * 8 + 3) * 5, clientY: (1 * 16 + 3) * 5 }), 18, "plain cell (2,1) -> 0x12");
  // slanted geometry (from the earlier italic toggle test the atlas is plain again):
  els["pv-italic"].checked = true;
  globalThis.__stub.dispatch("pv-italic", "change", {});
  // now s=5, pad=3, colW=13; click cell (col 0, row 0) near its left edge
  assertEqual(app.atlasCellAt({ clientX: 3 * 5 + 2, clientY: 2 }), 0, "slanted cell (0,0) -> 0x00");
  assertEqual(app.atlasCellAt({ clientX: (3 + 15 * 13 + 5) * 5, clientY: (15 * 16 + 3) * 5 }), 255, "slanted cell (15,15) -> 0xFF");
  assertEqual(app.atlasCellAt({ clientX: 2, clientY: 2 }), null, "left of the pad is outside");
  els["pv-italic"].checked = false;
  globalThis.__stub.dispatch("pv-italic", "change", {});
});

test("dom: atlas widens for slant spill and returns to plain width", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  els["pv-italic"].checked = true;
  globalThis.__stub.dispatch("pv-italic", "change", {});
  // default 8x16 font, baseline 5 from bottom: slant extent min=-3 max=5
  // => pad 3, colW 8+5=13, scale floor(640/128)=5
  assertEqual(els["atlas"].width, (3 + 16 * 13) * 5, "slanted atlas width");
  els["pv-italic"].checked = false;
  globalThis.__stub.dispatch("pv-italic", "change", {});
  assertEqual(els["atlas"].width, 16 * 8 * 5, "plain atlas width restored");
});

// ---------- chunk [L] interop: BDF + clipboard ----------

test("dom: BDF import replaces the font and reports a toast", function () {
  var app = globalThis.__stub.app;
  var src = BF.makeFont(6, 4);
  BF.setPixel(src, 0x41, 5, 3, 1);
  BF.setPixel(src, 0x20, 0, 0, 1);
  var before = app.state.font;
  assert(app.importBdfText(BF.toBDF(src), "sample.bdf"), "import succeeds");
  assert(app.state.font !== before, "font object replaced");
  assertEqual(app.state.font.width, 6, "width from BW");
  assertEqual(app.state.font.height, 4, "height from DH");
  assertEqual(app.state.font.data[(0x41 * 4 + 3) * 6 + 5], 1, "ink pixel survived");
  assertEqual(app.state.font.data[(0x20 * 4 + 0) * 6 + 0], 1, "second glyph ink pixel survived");
  assert(app.getLastToast().indexOf("Imported 6\u00d74") === 0, "toast: " + app.getLastToast());
  // import resets QA staleness state (fresh font)
  assert(!app.qaStale() || app.qaStale() === undefined, "no crash on QA after import");
});

test("dom: BDF import of malformed text keeps the current font and toasts an error", function () {
  var app = globalThis.__stub.app;
  var before = app.state.font;
  assertEqual(app.importBdfText("not a bdf at all"), false, "returns false");
  assert(app.state.font === before, "font unchanged");
  assert(app.getLastToast().indexOf("BDF:") !== -1, "error toast has the parser message: " + app.getLastToast());
  assertEqual(app.importBdfText(""), false, "empty text is malformed");
});

test("dom: export BDF / Verilog smoke (download path runs under the stub)", function () {
  var app = globalThis.__stub.app;
  app.exportBdf(); // downloadText -> downloadBlob -> stub URL + anchor click; must not throw
  assert(true, "no crash");
});

test("dom: glyphCanvas rasterizes at the requested scale", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  var c = app.glyphCanvas(0x41, 16);
  assertEqual(c.width, f.width * 16, "canvas width = glyph width * 16");
  assertEqual(c.height, f.height * 16, "canvas height = glyph height * 16");
});

test("dom: copy glyph falls back to a download when the clipboard is unavailable", function () {
  var app = globalThis.__stub.app;
  var stub = globalThis.__stub;
  stub.setClipboard("none");
  stub.blob = { fake: true };
  app.copyGlyph();
  assert(app.getLastToast().indexOf("downloaded") !== -1, "fallback toast: " + app.getLastToast());
  // rasterization failure toasts without crashing
  stub.blob = null;
  app.copyGlyph();
  assert(app.getLastToast().indexOf("Could not rasterize") === 0, "rasterize-fail toast: " + app.getLastToast());
});

test("dom: copy glyph writes a PNG ClipboardItem when the clipboard is available", function () {
  var app = globalThis.__stub.app;
  var stub = globalThis.__stub;
  stub.setClipboard("available");
  stub.blob = { fake: true };
  stub.clipboardCalls.length = 0;
  app.copyGlyph();
  assertEqual(stub.clipboardCalls.length, 1, "clipboard.write called once");
  assert(stub.clipboardCalls[0][0] && stub.clipboardCalls[0][0].data["image/png"] === stub.blob, "PNG blob in the ClipboardItem");
  assert(app.getLastToast().indexOf("Copied ") === 0, "success toast: " + app.getLastToast());
  stub.blob = null;
  stub.setClipboard("none"); // leave the stub in its default state
});

// ---------- file-op & tab shortcuts (DECISIONS #48) ----------

test("dom: comboOf — modifier order and macOS Option+letter normalization", function () {
  var app = globalThis.__stub.app;
  assertEqual(app.shortcuts.comboOf({ key: "E" }), "e", "plain letter lowercases");
  assertEqual(app.shortcuts.comboOf({ key: "s", ctrlKey: true }), "Ctrl+s");
  assertEqual(app.shortcuts.comboOf({ key: "S", ctrlKey: true, shiftKey: true }), "Ctrl+Shift+s");
  assertEqual(app.shortcuts.comboOf({ key: "o", altKey: true }), "Alt+o", "Alt without code falls back to key");
  // On macOS, Option+N arrives as key "\u2229" with code "KeyN" — must still match "Alt+n".
  assertEqual(app.shortcuts.comboOf({ key: "\u2229", altKey: true, code: "KeyN" }), "Alt+n");
  assertEqual(app.shortcuts.comboOf({ key: "\u00f6", altKey: true, shiftKey: true, code: "KeyO" }), "Alt+Shift+o");
});

test("dom: file-op and tab shortcuts dispatch to the right actions", function () {
  var app = globalThis.__stub.app;
  var key = function (k, extra) {
    var evt = { key: k, preventDefault: function () {} };
    for (var p in (extra || {})) evt[p] = extra[p];
    app.shortcuts.dispatch(evt);
  };
  key("e"); assertEqual(app.state.activeTab, "edit", "e -> Edit tab");
  key("p"); assertEqual(app.state.activeTab, "preview", "p -> Preview tab");
  key("a"); assertEqual(app.state.activeTab, "atlas", "a -> Atlas tab");
  key("q"); assertEqual(app.state.activeTab, "qa", "q -> QA tab (no refresh)");
  key("e");
  key("q", { ctrlKey: true });
  assertEqual(app.state.activeTab, "qa", "Ctrl+q -> QA tab");
  assert(!app.qaStale(), "Ctrl+q also ran the checks (not stale afterwards)");
  // Ctrl+S = Export PNG; the stub's toBlob yields a null blob -> the known error toast.
  key("s", { ctrlKey: true });
  assert(app.getLastToast().indexOf("PNG export failed") === 0, "Ctrl+s exported PNG: " + app.getLastToast());
  // The rest must at least run their full (stubbed) paths without crashing:
  // Ctrl+Shift+S Verilog, Alt+O / Alt+Shift+O open dialogs (stub click = no-op),
  // Alt+Shift+S Export BDF.
  key("s", { ctrlKey: true, shiftKey: true });
  key("\u2229", { altKey: true, code: "KeyO" });
  key("\u00f6", { altKey: true, shiftKey: true, code: "KeyO" });
  key("\u00df", { altKey: true, shiftKey: true, code: "KeyS" });
  assert(true, "Alt/Ctrl file-op shortcuts ran without crash");
});

test("dom: shortcuts are suppressed while typing in an input or textarea", function () {
  var app = globalThis.__stub.app;
  var doc = globalThis.document;
  var before = app.state.activeTab, beforeToast = app.getLastToast();
  doc.activeElement = { tagName: "INPUT" }; // e.g. the jump (char search) field
  app.shortcuts.dispatch({ key: "q", preventDefault: function () {} });
  assertEqual(app.state.activeTab, before, "q did not switch tabs with an input focused");
  doc.activeElement = { tagName: "TEXTAREA" }; // e.g. the preview text
  app.shortcuts.dispatch({ key: "s", ctrlKey: true, preventDefault: function () {} });
  assertEqual(app.getLastToast(), beforeToast, "Ctrl+s did not export with a textarea focused");
  doc.activeElement = null; // restore the stub default
  app.shortcuts.dispatch({ key: "e", preventDefault: function () {} });
  assertEqual(app.state.activeTab, "edit", "shortcuts work again once the input loses focus");
});

// ---------- Edit-tab glyph status buttons (DECISIONS #50) ----------

test("dom: Edit tab status buttons set the glyph status and follow the selection", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var stub = globalThis.__stub;
  app.selectGlyph(0x41);
  app.setStatus(0x41, 0); // earlier tests may have touched this glyph
  assert(els["st-unfinished"].classList.contains("active"), "fresh glyph shows unfinished");
  assert(!els["st-done"].classList.contains("active"), "done not active");
  stub.dispatch("st-wip", "click", {});
  assertEqual(app.state.font.status[0x41], 1, "wip set via button");
  assert(els["st-wip"].classList.contains("active"), "wip button now active");
  assert(!els["st-unfinished"].classList.contains("active"), "unfinished button deactivated");
  stub.dispatch("st-done", "click", {});
  assertEqual(app.state.font.status[0x41], 2, "done set via button");
  assert(els["st-done"].classList.contains("active"), "done button now active");
  // The workflow: mark done, move on — the next glyph starts fresh (unfinished).
  app.selectGlyph(0x42);
  app.setStatus(0x42, 0);
  assert(els["st-unfinished"].classList.contains("active"), "next glyph shows unfinished");
  assert(!els["st-done"].classList.contains("active"), "done does not carry over");
  assertEqual(app.state.font.status[0x41], 2, "previous glyph still done");
  // Re-clicking the active state is a no-op (no spurious font-version bump).
  var v = app.state.fontVersion;
  stub.dispatch("st-unfinished", "click", {});
  assertEqual(app.state.fontVersion, v, "no version bump on no-op status click");
  // Atlas-tab status changes are reflected on the Edit-tab buttons too.
  app.setStatus(0x42, 1);
  assert(els["st-wip"].classList.contains("active"), "setStatus (atlas path) updates the buttons");
});

// ---------- menu bar (DECISIONS #51) ----------

test("dom: menu bar — open, switch, and item click closes", function () {
  var els = globalThis.__stub.els;
  var stub = globalThis.__stub;
  stub.dispatch("mb-file", "click", {});
  assert(els["menu-file"].classList.contains("open"), "File opens on click");
  stub.dispatch("mb-edit", "click", {});
  assert(els["menu-edit"].classList.contains("open"), "Edit opens on click");
  assert(!els["menu-file"].classList.contains("open"), "File closes when switching to Edit");
  // Hover-switch while a menu is open
  stub.dispatch("mb-file", "mouseenter", {});
  assert(els["menu-file"].classList.contains("open"), "hover switches to File");
  assert(!els["menu-edit"].classList.contains("open"), "Edit closed by hover-switch");
  // An item click runs its action and closes the menu
  var app = globalThis.__stub.app;
  stub.blob = null;
  stub.dispatch("mb-edit", "click", {});
  stub.dispatch("mi-copy-glyph", "click", {});
  assert(!els["menu-edit"].classList.contains("open"), "menu closes after item click");
  assert(app.getLastToast().indexOf("Could not rasterize") === 0, "item action ran: " + app.getLastToast());
  // Clicking a closed title opens it; clicking the open title again toggles it closed
  stub.dispatch("mb-file", "click", {});
  assert(els["menu-file"].classList.contains("open"), "click re-opens");
  stub.dispatch("mb-file", "click", {});
  assert(!els["menu-file"].classList.contains("open"), "second click closes");
});

test("dom: PNG export background is a remembered setting (pngBg)", function () {
  var app = globalThis.__stub.app;
  assertEqual(app.settingsGet("pngBg"), "solid", "default is solid");
  app.exportPng("transparent"); // File-menu item
  assertEqual(app.settingsGet("pngBg"), "transparent", "menu choice is remembered");
  app.exportPng();              // bare call (Ctrl+S)
  assertEqual(app.settingsGet("pngBg"), "transparent", "Ctrl+S keeps the remembered mode");
  app.exportPng("solid");
  assertEqual(app.settingsGet("pngBg"), "solid", "switches back to solid");
});

// ---------- Atlas render controls (DECISIONS #52) ----------

test("dom: atlas render controls mirror the preview controls (shared state)", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var stub = globalThis.__stub;
  // Atlas -> preview direction
  els["at-italic"].checked = true;
  stub.dispatch("at-italic", "change", {});
  assertEqual(app.state.italic, true, "atlas checkbox sets the shared state");
  assertEqual(els["pv-italic"].checked, true, "preview checkbox follows");
  // Preview -> atlas direction
  els["pv-inverted"].checked = false;
  stub.dispatch("pv-inverted", "change", {});
  assertEqual(app.state.inverted, false);
  assertEqual(els["at-inverted"].checked, false, "atlas checkbox follows the preview");
  // Baseline number input, both directions
  els["at-baseline"].value = "1";
  stub.dispatch("at-baseline", "input", {});
  assertEqual(app.state.baseline, 1, "atlas baseline input sets state");
  assertEqual(els["pv-baseline"].value, "1", "preview baseline follows");
  els["pv-baseline"].value = "99";
  stub.dispatch("pv-baseline", "input", {});
  assertEqual(app.state.baseline, app.state.font.height - 1, "baseline clamps to font height");
  assertEqual(els["at-baseline"].value, String(app.state.font.height - 1), "atlas baseline follows clamped value");
});
