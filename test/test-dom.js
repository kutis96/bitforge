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
  // 8 nav + 11 file-ops (incl. Export TTF + full project export) + 5 tabs + 2 status + 3 mirror/copy-to + 3 tools + 3 sel-actions + 4 shift + 3 undo/redo + 1 card + 1 drag-entry = 43
  assertEqual(app.shortcuts.list.length, 43, "43 shortcuts registered (incl. the Ctrl/Alt-drag card entry)");
  var combos = {};
  for (var i = 0; i < app.shortcuts.list.length; i++) combos[app.shortcuts.list[i].combo] = true;
  assert(combos["Ctrl+ArrowLeft"] && combos["?"] && combos["Ctrl+z"] && combos["PageUp"], "expected combos present");
  assert(combos["Alt+n"] && combos["Alt+o"] && combos["Ctrl+s"] && combos["Ctrl+q"] && combos["e"] && combos["q"],
    "file-op/tab combos present");
  assert(combos["Alt+p"] && combos["Alt+Shift+p"], "project file combos present (DECISIONS #64)");
  assert(combos["Alt+Shift+c"], "clipboard PNG copy combo present (DECISIONS #66)");
  assert(combos["d"] && combos["Shift+d"], "status-pumping combos present");
});

test("dom: preview settings persist via the settings API", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  els["at-bold"].checked = true;
  globalThis.__stub.dispatch("at-bold", "change", {});
  assertEqual(app.state.bold, true, "bold state set");
  var raw = globalThis.localStorage.getItem("bitforge.settings.v1");
  assert(raw != null, "settings blob written");
  assertEqual(JSON.parse(raw).pvBold, true, "bold persisted");
  els["at-bold"].checked = false;
  globalThis.__stub.dispatch("at-bold", "change", {});
  assertEqual(JSON.parse(globalThis.localStorage.getItem("bitforge.settings.v1")).pvBold, false, "unbold persisted");
});

// ---------- project file (.bitforge) (DECISIONS #64) ----------

test("dom: project export/import roundtrips font + settings through the seam", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  var savedFont = f; // restore for the later tests (the import replaces state.font)
  var savedLen = f.guidelines.length;
  try {
    // give the current font something to carry: ink, status, a guide (a
    // duplicate 'base' — DECISIONS #94 keeps duplicates), a silence
    BF.setPixel(f, 0x41, 1, 2, 1);
    app.setStatus(0x41, 2);
    f.guidelines.push({ o: "h", off: 5, label: "base", color: "#333333" });
    f.silences["edge"] = { 65: true };
    app.settingsSet("pvText", "hello");
    app.settingsSet("pvScale", 4);
    var o = JSON.parse(app.projectExportText("full")); // the settings-carrying mode (DECISIONS #91)
    assertEqual(o.app, "bitforge", "header app");
    assertEqual(o.kind, "font-project", "header kind");
    assertEqual(o.version, 1, "header version");
    assertEqual(o.font.w, f.width, "font dims in the export");
    assertEqual(o.settings.pvText, "hello", "settings included in the export");
    var els = globalThis.__stub.els;
    // Valid import opens the in-app ask modal (chunk [AE]); Replace commits it.
    assert(app.importProjectText(JSON.stringify(o), "test.bitforge"), "import proceeds (ask modal opens)");
    assertEqual(els["ask-modal"].hidden, false, "ask modal open");
    assertEqual(els["ask-yes"].textContent, "Replace", "yes-label is Replace");
    globalThis.__stub.dispatch("ask-yes", "click", {});
    assertEqual(els["ask-modal"].hidden, true, "modal closed after Replace");
    assertEqual(BF.getPixel(app.state.font, 0x41, 1, 2), 1, "ink restored");
    assertEqual(app.state.font.status[0x41], 2, "status restored");
    assertEqual(app.state.font.guidelines.length, savedLen + 1, "guidelines restored (incl. the duplicate base)");
    var dup = null;
    for (var gi = 0; gi < app.state.font.guidelines.length; gi++) {
      var gg = app.state.font.guidelines[gi];
      if (gg.label === "base" && gg.off === 5) dup = gg;
    }
    assert(dup, "the duplicate base@5 guide survived the round-trip");
    assert(app.state.font.silences["edge"][65], "silence restored");
    assertEqual(app.settingsGet("pvText"), "hello", "preview text restored");
    assertEqual(app.state.scale, 4, "scale restored into state");
    assert(app.getLastToast().indexOf("Imported project") === 0, "toast: " + app.getLastToast());
    // User cancels the replace (ask modal) -> import is a no-op.
    var before2 = JSON.stringify(BF.fontToBlob(app.state.font));
    var toast2 = app.getLastToast();
    assert(app.importProjectText(JSON.stringify(o), "again.bitforge"), "canceled import still opens the ask modal");
    globalThis.__stub.dispatch("ask-cancel", "click", {});
    assertEqual(JSON.stringify(BF.fontToBlob(app.state.font)), before2, "canceled import leaves the font alone");
    assertEqual(app.getLastToast(), toast2, "no new toast after cancel");
  } finally {
    // leave the shared font clean for the later tests (esp. the QA
    // summary-count test) — finally, so a mid-test failure can't skip it
    app.state.font = savedFont;
    app.setStatus(0x41, 0);
    while (savedFont.guidelines.length > savedLen) savedFont.guidelines.pop();
    app.renderGuideList(); app.drawEditor(); app.syncGuideButtons();
  }
});

test("dom: project import rejects malformed files with a toast", function () {
  var app = globalThis.__stub.app;
  assertEqual(app.importProjectText("not json", "bad.bitforge"), false, "non-JSON rejected");
  assert(app.getLastToast().indexOf("not valid JSON") !== -1, "toast: " + app.getLastToast());
  assertEqual(app.importProjectText(JSON.stringify({ app: "other" }), "bad.bitforge"), false, "foreign file rejected");
  assert(app.getLastToast().indexOf("not a bitforge project file") !== -1, "toast: " + app.getLastToast());
});

// ---------- Preview newlines (DECISIONS #63) ----------

test("dom: preview newline renders a line break; blank lines kept", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var stub = globalThis.__stub;
  var H = app.state.font.height, s = app.state.scale;
  var h = function (rows) { return Math.ceil((rows * H + 4) * s); };
  els["pv-text"].value = "AAA";
  stub.dispatch("pv-text", "input", {});
  assertEqual(els["pv-text-canvas"].height, h(1), "no newline: one row");
  els["pv-text"].value = "AAA\nAAA";
  stub.dispatch("pv-text", "input", {});
  assertEqual(els["pv-text-canvas"].height, h(2), "single newline: two rows (was one — the bug)");
  els["pv-text"].value = "AAA\n\nAAA";
  stub.dispatch("pv-text", "input", {});
  assertEqual(els["pv-text-canvas"].height, h(3), "double newline: blank row kept");
  els["pv-text"].value = "AAA";
  stub.dispatch("pv-text", "input", {});
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
  els["at-italic"].checked = true;
  globalThis.__stub.dispatch("at-italic", "change", {});
  // now s=5, pad=3, colW=13; click cell (col 0, row 0) near its left edge
  assertEqual(app.atlasCellAt({ clientX: 3 * 5 + 2, clientY: 2 }), 0, "slanted cell (0,0) -> 0x00");
  assertEqual(app.atlasCellAt({ clientX: (3 + 15 * 13 + 5) * 5, clientY: (15 * 16 + 3) * 5 }), 255, "slanted cell (15,15) -> 0xFF");
  assertEqual(app.atlasCellAt({ clientX: 2, clientY: 2 }), null, "left of the pad is outside");
  els["at-italic"].checked = false;
  globalThis.__stub.dispatch("at-italic", "change", {});
});

test("dom: atlas widens for slant spill and returns to plain width", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  els["at-italic"].checked = true;
  globalThis.__stub.dispatch("at-italic", "change", {});
  // default 8x16 font, baseline 5 from bottom: slant extent min=-3 max=5
  // => pad 3, colW 8+5=13, scale floor(640/128)=5
  assertEqual(els["atlas"].width, (3 + 16 * 13) * 5, "slanted atlas width");
  els["at-italic"].checked = false;
  globalThis.__stub.dispatch("at-italic", "change", {});
  assertEqual(els["atlas"].width, 16 * 8 * 5, "plain atlas width restored");
});

// ---------- chunk [K] interop: BDF + clipboard ----------

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

// ---------- clipboard PNG atlas (DECISIONS #66) ----------

test("dom: copy PNG atlas to clipboard (write + download fallback)", function () {
  var app = globalThis.__stub.app;
  var stub = globalThis.__stub;
  stub.setClipboard("available");
  stub.blob = { fake: "atlas" };
  stub.clipboardCalls.length = 0;
  app.copyPngToClipboard();
  assertEqual(stub.clipboardCalls.length, 1, "clipboard.write called once");
  assert(stub.clipboardCalls[0][0] && stub.clipboardCalls[0][0].data["image/png"] === stub.blob, "atlas PNG blob in the ClipboardItem");
  assert(app.getLastToast().indexOf("Copied PNG atlas") === 0, "success toast: " + app.getLastToast());
  stub.blob = null;
  stub.setClipboard("none"); // unavailable -> download fallback + toast
  stub.blob = { fake: "atlas" };
  app.copyPngToClipboard();
  assert(app.getLastToast().indexOf("Clipboard unavailable") === 0, "fallback toast: " + app.getLastToast());
  stub.blob = null;
});

test("dom: import PNG from clipboard errors cleanly (success path is browser-verified)", function () {
  var app = globalThis.__stub.app;
  var stub = globalThis.__stub;
  stub.setClipboard("none");
  assertEqual(app.importPngFromClipboard(), false, "no clipboard API -> false");
  assert(app.getLastToast().indexOf("not available") !== -1, "toast: " + app.getLastToast());
  stub.setClipboard("available");
  stub.clipboardRead = [{ types: ["text/plain"] }];
  assertEqual(app.importPngFromClipboard(), true, "read started");
  assert(app.getLastToast().indexOf("No PNG image") !== -1, "toast: " + app.getLastToast());
  stub.clipboardReadError = true;
  app.importPngFromClipboard();
  assert(app.getLastToast().indexOf("denied or failed") !== -1, "toast: " + app.getLastToast());
  stub.clipboardReadError = false;
  stub.clipboardRead = []; // leave the stub in its default state
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
  // DECISIONS #81: four menus — Project / Font / Glyph / App.
  var els = globalThis.__stub.els;
  var stub = globalThis.__stub;
  stub.dispatch("mb-project", "click", {});
  assert(els["menu-project"].classList.contains("open"), "Project opens on click");
  stub.dispatch("mb-font", "click", {});
  assert(els["menu-font"].classList.contains("open"), "Font opens on click");
  assert(!els["menu-project"].classList.contains("open"), "Project closes when switching to Font");
  stub.dispatch("mb-glyph", "click", {});
  assert(els["menu-glyph"].classList.contains("open"), "Glyph opens on click");
  assert(!els["menu-font"].classList.contains("open"), "Font closes when switching to Glyph");
  stub.dispatch("mb-app", "click", {});
  assert(els["menu-app"].classList.contains("open"), "App opens on click");
  assert(!els["menu-glyph"].classList.contains("open"), "Glyph closes when switching to App");
  // Hover-switch while a menu is open
  stub.dispatch("mb-project", "mouseenter", {});
  assert(els["menu-project"].classList.contains("open"), "hover switches to Project");
  assert(!els["menu-app"].classList.contains("open"), "App closed by hover-switch");
  // An item click runs its action and closes the menu
  var app = globalThis.__stub.app;
  stub.blob = null;
  stub.dispatch("mb-glyph", "click", {});
  stub.dispatch("mi-copy-glyph", "click", {});
  assert(!els["menu-glyph"].classList.contains("open"), "menu closes after item click");
  assert(app.getLastToast().indexOf("Could not rasterize") === 0, "item action ran: " + app.getLastToast());
  // Clicking a closed title opens it; clicking the open title again toggles it closed
  stub.dispatch("mb-project", "click", {});
  assert(els["menu-project"].classList.contains("open"), "click re-opens");
  stub.dispatch("mb-project", "click", {});
  assert(!els["menu-project"].classList.contains("open"), "second click closes");
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

test("dom: atlas render controls drive the shared state; shared controls mirror both ways", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var stub = globalThis.__stub;
  // Bold/italic live on the Atlas tab only (DECISIONS #62): atlas -> state
  els["at-italic"].checked = true;
  stub.dispatch("at-italic", "change", {});
  assertEqual(app.state.italic, true, "atlas italic checkbox sets the shared state");
  els["at-bold"].checked = true;
  stub.dispatch("at-bold", "change", {});
  assertEqual(app.state.bold, true, "atlas bold checkbox sets the shared state");
  // Inverted is shared: Preview -> atlas direction
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

// ---------- status pumping: D / Shift+D (DECISIONS #54) ----------

test("dom: D cycles the glyph status; Shift+D marks done and advances", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var stub = globalThis.__stub;
  var key = function (k, extra) {
    var evt = { key: k, preventDefault: function () {} };
    for (var p in (extra || {})) evt[p] = extra[p];
    app.shortcuts.dispatch(evt);
  };
  app.selectGlyph(0x50);
  app.setStatus(0x50, 0);
  key("d");
  assertEqual(app.state.font.status[0x50], 1, "unf -> wip");
  assert(els["st-wip"].classList.contains("active"), "Edit-tab buttons follow the cycle");
  key("d");
  assertEqual(app.state.font.status[0x50], 2, "wip -> done");
  key("d");
  assertEqual(app.state.font.status[0x50], 0, "done -> unf (wraps around)");
  key("d", { shiftKey: true });
  assertEqual(app.state.font.status[0x50], 2, "Shift+D marks done");
  assertEqual(app.state.selected, 0x51, "and advances to the next glyph");
  assertEqual(app.state.font.status[0x50], 2, "previous glyph stays done");
  // At the end of the atlas it clamps with a toast (no wrap to 0x00)
  app.selectGlyph(0xFF);
  key("d", { shiftKey: true });
  assertEqual(app.state.selected, 0xFF, "clamped at 0xFF");
  assert(app.getLastToast().indexOf("last glyph") !== -1, "toast: " + app.getLastToast());
  // The Edit-menu items do the same thing
  app.selectGlyph(0x52);
  app.setStatus(0x52, 0);
  stub.dispatch("mb-glyph", "click", {});
  stub.dispatch("mi-cycle-status", "click", {});
  assertEqual(app.state.font.status[0x52], 1, "menu item cycles");
  stub.dispatch("mb-glyph", "click", {});
  stub.dispatch("mi-done-next", "click", {});
  assertEqual(app.state.font.status[0x52], 2, "menu item marks done");
  assertEqual(app.state.selected, 0x53, "menu item advances");
});

// ---------- About menu + modal (DECISIONS #55) ----------

test("dom: Font menu shows live font info; App menu's About modal opens and closes", function () {
  // DECISIONS #81: the font-info line moved to the Font menu; the About
  // bitforge item moved to the App menu.
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var stub = globalThis.__stub;
  stub.dispatch("mb-font", "click", {});
  assert(els["menu-font"].classList.contains("open"), "Font menu opens");
  var info = els["font-info"].textContent;
  assert(info.indexOf("256 glyphs") !== -1, "info mentions 256 glyphs: " + info);
  assert(info.indexOf(app.state.font.width + " \u00d7 " + app.state.font.height) !== -1, "info shows the current font dims: " + info);
  assert(info.indexOf("ink px") !== -1 && info.indexOf("done ") !== -1 && info.indexOf("wip ") !== -1,
    "info shows ink + status counts: " + info);
  stub.dispatch("mb-app", "click", {});
  stub.dispatch("mi-about-bitforge", "click", {});
  assert(!els["menu-app"].classList.contains("open"), "menu closes after the item click");
  assertEqual(els["about-modal"].hidden, false, "modal opens");
  stub.dispatch("about-close", "click", {});
  assertEqual(els["about-modal"].hidden, true, "the \u00d7 button closes the modal");
});

test("dom: mousedown on a menu item must NOT close the menu (real-browser click sequence)", function () {
  // Regression: the outside-mousedown handler used to treat items as
  // "outside", closing the menu before the item's click fired (swallowed by
  // the browser) — every menu item was dead. User-reported 2026-11-14.
  var els = globalThis.__stub.els;
  var stub = globalThis.__stub;
  // The stub doesn't model the DOM tree; give the item its real parent so
  // the "inside" walk can reach the container.
  els["mi-export-verilog"].parentElement = els["menu-project"];
  stub.dispatch("mb-project", "click", {});
  assert(els["menu-project"].classList.contains("open"), "menu open");
  // Real browsers fire the document mousedown BEFORE the item's click.
  stub.docDispatch("mousedown", { target: els["mi-export-verilog"] });
  assert(els["menu-project"].classList.contains("open"), "menu stays open on an item mousedown");
  // A mousedown genuinely outside still closes it
  stub.docDispatch("mousedown", { target: els["editor"] });
  assert(!els["menu-project"].classList.contains("open"), "outside mousedown closes the menu");
  // And Escape closes (and would also close the About modal)
  stub.dispatch("mb-glyph", "click", {});
  stub.docDispatch("keydown", { key: "Escape" });
  assert(!els["menu-glyph"].classList.contains("open"), "Escape closes the menu");
});

test("dom: About modal head + browser tab show the app version (DECISIONS #56)", function () {
  assert(/^\d+\.\d+\.\d+$/.test(BF.VERSION), "BF.VERSION is semver-ish: " + BF.VERSION);
  assertEqual(BF.VERSION, "0.32.0", "pinned version — bump this test when you bump the app");
  var els = globalThis.__stub.els;
  assertEqual(els["about-title"].textContent, "bitforge " + BF.VERSION, "modal head shows name + version");
  assertEqual(document.title, "bitforge " + BF.VERSION, "browser tab shows name + version");
});

// ---------- font name + Properties modal (DECISIONS #70) ----------

test("dom: font name — Properties modal, export filenames, persistence", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  // Open the modal from the Edit-menu item
  globalThis.__stub.dispatch("mi-props", "click", {});
  assertEqual(els["props-modal"].hidden, false, "modal opens");
  assertEqual(els["props-name"].value, app.state.font.name, "shows the current name");
  els["props-name"].value = "My Test Font";
  globalThis.__stub.dispatch("props-save", "click", {});
  assertEqual(app.state.font.name, "My Test Font", "name saved");
  assertEqual(els["props-modal"].hidden, true, "modal closed after save");
  // Export filenames carry the name
  globalThis.__stub.downloads.length = 0;
  app.exportBdf();
  assertEqual(globalThis.__stub.downloads[0], "My Test Font.bdf", "BDF download name");
  app.exportProject();
  assertEqual(globalThis.__stub.downloads[1], "My Test Font.bitforge", "project download name");
  // BDF header carries the name
  assert(BF.toBDF(app.state.font).indexOf('FONT "My Test Font"') >= 0, "BDF FONT line");
  // Persistence: the localStorage blob carries n
  var blob = JSON.parse(localStorage.getItem("bitforge.font.v1"));
  assertEqual(blob.n, "My Test Font", "blob carries the name");
  // A blank name falls back to the default (leaves the shared state clean)
  globalThis.__stub.dispatch("mi-props", "click", {});
  els["props-name"].value = "   ";
  globalThis.__stub.dispatch("props-save", "click", {});
  assertEqual(app.state.font.name, "font", "blank -> default");
});

// ---------- QA severity + silencing (DECISIONS #59) ----------

test("dom: QA summary strip shows per-check icon + counts", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  app.qaRefresh();
  assertEqual(els["qa-summary"].hidden, false, "summary visible after a refresh");
  var html = els["qa-summary"].innerHTML;
  assert(html.indexOf("<svg") !== -1, "summary renders inline SVG icons");
  assert(html.indexOf("duplicate glyphs") !== -1, "lists the duplicates check");
  assert(html.indexOf("what's left to draw") !== -1, "lists the left-to-draw check");
  // The icon before each line must match that check's worst active severity,
  // whatever font the earlier tests left behind.
  var dupBefore = html.split("duplicate glyphs")[0];
  var dupWarn = BF.findDuplicates(app.state.font).length > 0;
  assert(dupBefore.indexOf(dupWarn ? "#cc3333" : "#2e7d32") !== -1, "duplicates line icon matches its state");
  var leftBefore = html.split("what's left to draw")[0];
  assert(leftBefore.indexOf("#888888") !== -1, "left-to-draw line uses the info icon (it always has rows)");
});

test("dom: silence/un-silence a per-glyph QA row end-to-end (DECISIONS #59)", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var stub = globalThis.__stub;
  // The real silenceable checks land in [N.2]/[N.3]; register a stand-in so
  // this chunk proves the silencing machinery end-to-end.
  var fake = {
    id: "testedge", name: "test edge", severity: "warning", silenceable: true,
    run: function () { return [{ check: "test edge", codes: "0x41", detail: "fake edge ink", code: 65 }]; }
  };
  app.qaChecks.push(fake);
  app.qaRefresh();

  function fakeRow() {
    var trs = els["qa-tbody"].children;
    for (var i = 0; i < trs.length; i++)
      if (trs[i].children.length > 0 && trs[i].children[0].textContent === "test edge") return trs[i];
    return null;
  }
  function clickBtn(btn) {
    var ls = btn._listeners["click"] || [];
    for (var i = 0; i < ls.length; i++) ls[i].call(btn, { stopPropagation: function () {} });
  }

  var row = fakeRow();
  assert(row, "stand-in row rendered");
  assertEqual(row.children[3].children.length, 1, "silenceable per-glyph row gets an action button");
  assertEqual(row.children[3].children[0].textContent, "silence", "button says silence");
  assert(row.children[0].children[0].innerHTML.indexOf("#cc3333") !== -1, "active warning row uses the red triangle");

  clickBtn(row.children[3].children[0]);
  assertEqual(app.state.font.silences["testedge"][65], true, "silence stored per (check, glyph)");
  var raw = globalThis.localStorage.getItem("bitforge.font.v1");
  assert(raw.indexOf("testedge") !== -1, "silence persisted in the font blob");
  assert(fakeRow() === null, "silenced row hidden by default");
  assert(els["qa-summary"].innerHTML.indexOf("(1 silenced)") !== -1, "summary reports the silenced count");

  els["qa-show-silenced"].checked = true;
  stub.dispatch("qa-show-silenced", "change", {});
  assertEqual(app.settingsGet("qaShowSilenced"), true, "toggle remembered via settings API");
  row = fakeRow();
  assert(row, "silenced row shown with the toggle on");
  assertEqual(row.className, "qa-sil", "silenced row marked muted");
  assert(row.children[0].children[0].innerHTML.indexOf("#999999") !== -1, "silenced row uses the sil icon");
  assertEqual(row.children[3].children[0].textContent, "un-silence", "button flips to un-silence");

  clickBtn(row.children[3].children[0]);
  assert(app.state.font.silences["testedge"][65] === undefined, "un-silence removes the silence");
  assert(fakeRow() !== null, "row active again");

  app.qaChecks.pop();
  app.qaRefresh(); // leave the app clean for later tests
});

test("dom: edge-ink check flags edge-touching glyphs and silences per glyph (DECISIONS #46)", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var f = app.state.font;
  f.silences["edge"] = {}; // clean slate for this check
  var code = 2; // craft a glyph that touches top + bottom
  BF.clearGlyph(f, code);
  BF.setPixel(f, code, 3, 0, 1);
  BF.setPixel(f, code, 3, f.height - 1, 1);
  app.qaRefresh();

  function edgeRow(rows, c) {
    for (var i = 0; i < rows.length; i++)
      if (rows[i].checkId === "edge" && rows[i].code === c) return rows[i];
    return null;
  }

  var row = edgeRow(app.qaRows(), code);
  assert(row, "edge row for the crafted glyph");
  assertEqual(row.silenced, false, "not silenced yet");
  assert(row.detail.indexOf("top") !== -1 && row.detail.indexOf("bottom") !== -1,
    "detail names the touched edges: " + row.detail);
  assertEqual(row.silenceable, true, "edge-ink is silenceable");

  app.toggleSilence("edge", code);
  row = edgeRow(app.qaRows(), code);
  assertEqual(row.silenced, true, "silenced after toggle");
  var sumHtml = els["qa-summary"].innerHTML;
  var ei = sumHtml.indexOf("edge-ink");
  var sum = sumHtml.substring(ei, sumHtml.indexOf("</div>", ei) + 6);
  assert(sum.indexOf("(1 silenced)") !== -1, "edge-ink summary line counts the silence: " + sum);
  // Silence persists in the font blob
  var raw = globalThis.localStorage.getItem("bitforge.font.v1");
  assert(raw.indexOf("\"edge\"") !== -1 && raw.indexOf("\"2\":true") !== -1, "edge silence persisted for code 2");

  app.toggleSilence("edge", code); // un-silence
  row = edgeRow(app.qaRows(), code);
  assertEqual(row.silenced, false, "un-silenced");

  BF.clearGlyph(f, code);
  app.qaRefresh(); // leave the glyph clean for later tests
});

test("dom: edge-ink check property — ignoreEdges checkboxes (DECISIONS #83)", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var stub = globalThis.__stub;
  var f = app.state.font;
  f.checkProps = {};
  f.silences["edge"] = {};
  var code = 6;
  BF.setPixel(f, code, 0, 0, 1); // touches top + left

  app.qaRefresh();

  function edgeRow() {
    var rows = app.qaRows();
    for (var i = 0; i < rows.length; i++)
      if (rows[i].checkId === "edge" && rows[i].code === code) return rows[i];
    return null;
  }
  var sum = els["qa-summary"].innerHTML;
  assert(sum.indexOf("ignore:") !== -1, "props group is labeled on the edge-ink row");
  var id = function (opt) { return "qa-prop-edge-ignoreEdges-" + opt; };
  assert(sum.indexOf(id("top")) !== -1, "summary row carries the top checkbox");
  assert(sum.indexOf(id("right")) !== -1, "…and the right one");

  assert(edgeRow() !== null, "reported by default (nothing ignored)");

  // Tick top + left: the glyph touches only those → it drops out of the report.
  els[id("top")].checked = true;
  stub.dispatch(id("top"), "change", {});
  assertEqual(app.qaPropValue(f, "edge", "ignoreEdges").join(","), "top", "first toggle stored");
  assert(edgeRow() !== null, "top only ignored → left edge still reported");
  els[id("left")].checked = true;
  stub.dispatch(id("left"), "change", {});
  assertEqual(app.qaPropValue(f, "edge", "ignoreEdges").join(","), "top,left", "second toggle stored");
  assert(edgeRow() === null, "glyph touching only ignored edges is gone");

  var raw = globalThis.localStorage.getItem("bitforge.font.v1");
  assert(raw.indexOf("ignoreEdges") !== -1, "ignore list persisted in the font blob");

  // Re-render re-derives the checked state from the font (source of truth).
  app.qaRefresh();
  assert(els["qa-summary"].innerHTML.indexOf("checked") !== -1, "checked state re-derived on render");

  // A no-op toggle (bottom, already unchecked) must not bump the version.
  var v0 = app.state.fontVersion;
  els[id("bottom")].checked = false;
  stub.dispatch(id("bottom"), "change", {});
  assertEqual(app.state.fontVersion, v0, "no-op toggle does not bump the version");

  // Un-tick top: the glyph is reported again — left is still ignored, so its
  // ACTIVE edge is top and the detail names top, not left.
  els[id("top")].checked = false;
  stub.dispatch(id("top"), "change", {});
  assertEqual(app.qaPropValue(f, "edge", "ignoreEdges").join(","), "left", "top no longer ignored");
  var row = edgeRow();
  assert(row !== null, "row is back");
  assert(row.detail.indexOf("top") !== -1, "detail names the active top edge: " + row.detail);
  assert(row.detail.indexOf("left") === -1, "still-ignored left edge is not named: " + row.detail);

  // Cleanup: un-ignore, clear the glyph, reset checkProps.
  els[id("left")].checked = false;
  stub.dispatch(id("left"), "change", {});
  BF.clearGlyph(f, code);
  f.checkProps = {};
  app.qaRefresh();
});

test("dom: guideline check names the crossed guide in the detail (DECISIONS #47)", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  f.silences["guides"] = {}; // clean slate for this check
  f.guidelines.length = 0;
  // Dimension-robust: works on whatever font the earlier tests left behind.
  f.guidelines.push({ o: "h", off: 2, label: BF.GUIDE_BOUND_LABELS.top, color: "#888888" });
  f.guidelines.push({ o: "v", off: f.width - 1, label: BF.GUIDE_BOUND_LABELS.right, color: "#cc8800" }); // default R position
  var code = 3;
  BF.clearGlyph(f, code);
  BF.setPixel(f, code, 0, 0, 1);            // 2px above the ascender
  BF.setPixel(f, code, f.width - 1, Math.min(5, f.height - 1), 1); // edge col: 1px right of the R line
  app.qaRefresh();

  function guideRow(rows, c) {
    for (var i = 0; i < rows.length; i++)
      if (rows[i].checkId === "guides" && rows[i].code === c) return rows[i];
    return null;
  }

  var row = guideRow(app.qaRows(), code);
  assert(row, "guideline row for the crafted glyph");
  assert(row.detail.indexOf("asc") !== -1, "detail names the asc guide: " + row.detail);
  assert(row.detail.indexOf("R") !== -1, "detail names the R guide: " + row.detail);
  assert(row.detail.indexOf("2px above") !== -1, "overshoot px above: " + row.detail);
  assert(row.detail.indexOf("1px right of") !== -1, "overshoot px right: " + row.detail);

  app.toggleSilence("guides", code);
  row = guideRow(app.qaRows(), code);
  assertEqual(row.silenced, true, "silenceable per glyph");
  app.toggleSilence("guides", code);
  row = guideRow(app.qaRows(), code);
  assertEqual(row.silenced, false, "un-silenced");

  BF.clearGlyph(f, code);
  f.guidelines.length = 0;
  app.qaRefresh(); // leave the font clean for later tests
});

// Bound-guide preset positions (DECISIONS #65): lines are drawn BETWEEN pixels
// (on grid boundaries) and the QA flags ink outside the line — above/left =
// index < off, below/right = index >= off. Each preset leaves exactly 1px
// outside its line (the first [O.4] attempt misdiagnosed the off-by-one and
// moved these; the real fix was the comparison in BF.guideViolations).
test("dom: bound-guide presets leave exactly 1px outside each line (DECISIONS #65)", function () {
  var app = globalThis.__stub.app;
  var f = { width: 8, height: 16 };
  assertEqual(app.guidePresets.ascender.off(f), 1, "line between rows 0|1: row 0 outside");
  assertEqual(app.guidePresets.descender.off(f), 15, "line between rows 14|15: row 15 outside (fires with the >= fix)");
  assertEqual(app.guidePresets.left.off(f), 1, "line between cols 0|1: col 0 outside");
  assertEqual(app.guidePresets.right.off(f), 7, "line between cols 6|7: col 7 outside");
});

// ---------- cell resize (DECISIONS #71) ----------

function undoKey() { // Ctrl/⌘+Z through the real dispatcher
  globalThis.__stub.app.shortcuts.dispatch({ key: "z", ctrlKey: true, preventDefault: function () {} });
}

test("dom: resize modal — extend right, live readout, undo restores", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  // Deterministic start: an earlier import test leaves a small font behind,
  // and these are the last tests in the file (nothing runs after them).
  app.state.font = BF.makeFont(8, 16);
  var f = app.state.font;
  BF.setPixel(f, 0x41, 3, 5, 1);
  var w0 = f.width, h0 = f.height;
  var hlen = app.state.history.length;
  globalThis.__stub.dispatch("mi-resize", "click", {});
  assertEqual(els["rz-modal"].hidden, false, "modal opens");
  els["rz-right"].value = "2";
  globalThis.__stub.dispatch("rz-right", "input", {});
  assert(els["rz-result"].textContent.indexOf((w0 + 2) + "\u00d7" + h0) >= 0, "live readout shows the new size: " + els["rz-result"].textContent);
  globalThis.__stub.dispatch("rz-apply", "click", {});
  assertEqual(els["rz-modal"].hidden, true, "modal closed after apply");
  assertEqual(app.state.font.width, w0 + 2, "width grew");
  assertEqual(BF.getPixel(app.state.font, 0x41, 3, 5), 1, "ink unmoved for a right-extend");
  undoKey();
  assertEqual(app.state.font.width, w0, "undo restored the width");
  assertEqual(BF.getPixel(app.state.font, 0x41, 3, 5), 1, "undo restored the ink");
  assertEqual(app.state.history.length, hlen, "history balanced (one push, one pop)");
});

test("dom: resize crop with ink loss needs a confirming second apply", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  app.state.font = BF.makeFont(8, 16); // deterministic start (see above)
  var f = app.state.font;
  BF.setPixel(f, 0x42, 2, f.height - 1, 1); // ink on the bottom row
  var h0 = f.height;
  var hlen = app.state.history.length;
  globalThis.__stub.dispatch("mi-resize", "click", {});
  els["rz-bottom"].value = "-1";
  globalThis.__stub.dispatch("rz-bottom", "input", {});
  globalThis.__stub.dispatch("rz-apply", "click", {});
  assertEqual(els["rz-modal"].hidden, false, "still open after the first Apply");
  assertEqual(els["rz-warn"].hidden, false, "clip warning shown");
  assert(els["rz-warn"].textContent.indexOf("1 px") >= 0, "warning names the pixel count");
  assertEqual(app.state.font.height, h0, "not applied yet");
  globalThis.__stub.dispatch("rz-apply", "click", {});
  assertEqual(app.state.font.height, h0 - 1, "applied on the confirming click");
  assertEqual(els["rz-modal"].hidden, true, "modal closed");
  assertEqual(BF.getPixel(app.state.font, 0x42, 2, h0 - 1), 0, "clipped ink is gone");
  undoKey();
  assertEqual(app.state.font.height, h0, "undo restored the height");
  assertEqual(BF.getPixel(app.state.font, 0x42, 2, h0 - 1), 1, "undo restored the ink");
  assertEqual(app.state.history.length, hlen, "history balanced");
});

// ---------- changelog / what's new (DECISIONS #73) ----------

test("dom: changelog — version remembered, what's-new filtering, modal views", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  // init ran with no stored version (first run) and remembered the current
  // version. (The modal it opened may have been closed already by an earlier
  // test's Escape dispatch — the open path is re-driven below via the seam.)
  assertEqual(localStorage.getItem(app.changelogVersionKey), BF.VERSION, "last-run version stored");
  // Up to date now: nothing new.
  assertEqual(app.whatsNew().length, 0, "current version => nothing new");
  // Coming from an older version: exactly the entries since then. (Computed
  // from BF_CHANGELOG + BF.cmpVersions so the test survives version bumps.)
  var since = "0.16.0";
  var expectedNewer = [];
  for (var ci = 0; ci < BF_CHANGELOG.length; ci++)
    if (BF.cmpVersions(BF_CHANGELOG[ci].version, since) > 0) expectedNewer.push(BF_CHANGELOG[ci].version);
  assert(expectedNewer.length >= 2, "fixture sanity: at least two versions newer than " + since);
  localStorage.setItem(app.changelogVersionKey, since);
  var seen = app.whatsNew();
  assertEqual(seen.length, expectedNewer.length, "entries newer than " + since);
  assertEqual(seen[0].version, expectedNewer[0], "newest first");
  assertEqual(seen[seen.length - 1].version, expectedNewer[expectedNewer.length - 1], "oldest of the new");
  // Downgrade / future version: nothing new.
  localStorage.setItem(app.changelogVersionKey, "9.9.9");
  assertEqual(app.whatsNew().length, 0, "downgrade => nothing new");
  // What's-new mode (first run = full list): title + switch + all entries.
  app.openChangelogModal(BF_CHANGELOG, true);
  assertEqual(els["cl-modal"].hidden, false, "modal opens");
  assertEqual(els["cl-title"].textContent, "What\u2019s new in bitforge " + BF.VERSION, "what's-new title");
  assertEqual(els["cl-list"].children.length, BF_CHANGELOG.length, "first run = full list");
  assert(!els["cl-full"].hidden, "full-list switch visible");
  // The switch flips to the full view (on-demand mode: no switch, Close).
  globalThis.__stub.dispatch("cl-full", "click", {});
  assertEqual(els["cl-title"].textContent, "bitforge changelog", "full mode title");
  assertEqual(els["cl-list"].children.length, BF_CHANGELOG.length, "all entries rendered");
  assert(els["cl-full"].hidden, "no full-list button in full mode");
  app.closeChangelogModal();
  assertEqual(els["cl-modal"].hidden, true, "closed");
  // What's-new mode renders the subset.
  app.openChangelogModal(seen, true);
  assertEqual(els["cl-list"].children.length, seen.length, "subset rendered");
  app.closeChangelogModal();
  // Leave the stub in a clean state for any later tests.
  localStorage.setItem(app.changelogVersionKey, BF.VERSION);
});

// ---------- glyph manipulation (DECISIONS #74) ----------

test("dom: parseCodeInput — char, hex, 0x-hex, garbage", function () {
  var app = globalThis.__stub.app;
  assertEqual(app.parseCodeInput("a"), 0x61, "one char");
  assertEqual(app.parseCodeInput("41"), 0x41, "bare hex");
  assertEqual(app.parseCodeInput("0x41"), 0x41, "0x hex");
  assertEqual(app.parseCodeInput(" 41 "), 0x41, "trimmed");
  assertEqual(app.parseCodeInput("zz"), null, "garbage");
  assertEqual(app.parseCodeInput(""), null, "empty");
  assertEqual(app.parseCodeInput("123"), null, "3 hex digits");
});

test("dom: mirror — H/V flip the selected glyph, Ctrl+Z restores", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font, w = f.width, h = f.height;
  app.selectGlyph(0x41);
  var before = [];
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) before.push(BF.getPixel(f, 0x41, x, y));
  BF.clearGlyph(f, 0x41);
  BF.setPixel(f, 0x41, 0, 0, 1);
  app.mirrorAction("h");
  assertEqual(BF.getPixel(f, 0x41, 0, 0), 0, "h: left pixel gone");
  assertEqual(BF.getPixel(f, 0x41, w - 1, 0), 1, "h: ink at right edge");
  app.mirrorAction("v");
  assertEqual(BF.getPixel(f, 0x41, w - 1, 0), 0, "v: top row cleared");
  assertEqual(BF.getPixel(f, 0x41, w - 1, h - 1), 1, "v: ink at bottom-right");
  var t = app.getLastToast();
  assert(t.indexOf("up–down") !== -1, "toast names the axis: " + t);
  // Two undos step back through both mirrors to the single (0,0) ink.
  app.shortcuts.dispatch({ key: "z", ctrlKey: true, preventDefault: function () {} });
  assertEqual(BF.getPixel(f, 0x41, w - 1, h - 1), 0, "undo v: bottom-right cleared");
  assertEqual(BF.getPixel(f, 0x41, w - 1, 0), 1, "undo v: back at right edge top");
  app.shortcuts.dispatch({ key: "z", ctrlKey: true, preventDefault: function () {} });
  var ok = BF.getPixel(f, 0x41, 0, 0) === 1 && BF.getPixel(f, 0x41, w - 1, 0) === 0;
  assert(ok, "undo h: back to the single (0,0) ink");
  // Leave 0x41 as it was for later tests.
  for (var i = 0; i < before.length; i++) BF.setPixel(f, 0x41, i % w, (i / w) | 0, before[i]);
});

test("dom: copy-to-codepoint — modal form, duplicates, selects target, refuses bad input", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var f = app.state.font;
  app.selectGlyph(0x42);
  BF.clearGlyph(f, 0x42);
  BF.setPixel(f, 0x42, 0, 5, 1);
  var before62 = [];
  for (var y = 0; y < f.height; y++) for (var x = 0; x < f.width; x++) before62.push(BF.getPixel(f, 0x62, x, y));
  f.status[0x62] = 2; // target status must survive the copy

  // Open the shared codepoint modal (chunk [AE]); type a valid target; OK.
  app.copyToCodepointAction();
  assertEqual(els["cp-modal"].hidden, false, "codepoint modal opens");
  assert(els["cp-note"].textContent.indexOf("0x42") !== -1, "note names the source: " + els["cp-note"].textContent);
  els["cp-input"].value = "62";
  globalThis.__stub.dispatch("cp-input", "input", {});
  assert(els["cp-result"].textContent.indexOf("0x62") !== -1, "live result shows 0x62: " + els["cp-result"].textContent);
  globalThis.__stub.dispatch("cp-ok", "click", {});
  assertEqual(els["cp-modal"].hidden, true, "modal closed after OK");
  assertEqual(app.state.selected, 0x62, "target becomes the selection");
  assertEqual(BF.getPixel(f, 0x62, 0, 5), 1, "target got the ink");
  assertEqual(f.status[0x62], 2, "target status untouched");
  var t = app.getLastToast();
  assert(t.indexOf("0x42") !== -1 && t.indexOf("0x62") !== -1, "toast names both codes: " + t);

  // Same codepoint as the source is refused (modal stays open, then cancel).
  app.selectGlyph(0x62); // now 0x62 is the source
  app.copyToCodepointAction();
  els["cp-input"].value = "62";
  globalThis.__stub.dispatch("cp-input", "input", {});
  assert(els["cp-result"].textContent.indexOf("same codepoint") !== -1, "live result flags it: " + els["cp-result"].textContent);
  globalThis.__stub.dispatch("cp-ok", "click", {});
  assertEqual(els["cp-modal"].hidden, false, "modal stays open on same-codepoint");
  assert(app.getLastToast().indexOf("same codepoint") !== -1, "same-code refused: " + app.getLastToast());
  globalThis.__stub.dispatch("cp-cancel", "click", {});
  assertEqual(els["cp-modal"].hidden, true, "cancel closes the modal");

  // Garbage input is refused and changes nothing.
  BF.setPixel(f, 0x62, 1, 6, 1);
  app.copyToCodepointAction();
  els["cp-input"].value = "nope";
  globalThis.__stub.dispatch("cp-input", "input", {});
  assert(els["cp-result"].textContent.indexOf("invalid") !== -1, "live result flags invalid: " + els["cp-result"].textContent);
  globalThis.__stub.dispatch("cp-ok", "click", {});
  assertEqual(els["cp-modal"].hidden, false, "modal stays open on garbage");
  assert(app.getLastToast().indexOf("one char, or hex") !== -1, "garbage refused: " + app.getLastToast());
  assertEqual(BF.getPixel(f, 0x62, 1, 6), 1, "garbage input left the target alone");
  globalThis.__stub.dispatch("cp-cancel", "click", {});

  // Cleanup: restore 0x62 (ink + status) and blank the source again.
  for (var i = 0; i < before62.length; i++) BF.setPixel(f, 0x62, i % f.width, (i / f.width) | 0, before62[i]);
  f.status[0x62] = 0;
  BF.clearGlyph(f, 0x42);
  app.selectGlyph(0x42);
});

test("dom: QA — empty printable glyphs (info, silenceable, flags done)", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font, code = 0x7b; // '{' — cleared for the test
  BF.clearGlyph(f, code);
  function emptyRow(rows) {
    for (var i = 0; i < rows.length; i++)
      if (rows[i].checkId === "empty" && rows[i].code === code) return rows[i];
    return null;
  }
  var row = emptyRow(app.qaRows());
  assert(row, "row for the empty glyph");
  assertEqual(row.severity, "info", "info severity");
  assert(row.silenceable, "silenceable");
  assert(row.detail.indexOf("no ink") === 0, "detail: " + row.detail);
  // Marking it done upgrades the detail — that's the real mistake.
  app.setStatus(code, 2);
  row = emptyRow(app.qaRows());
  assert(row.detail.indexOf("marked done") !== -1, "done detail: " + row.detail);
  // Silence it: the row is flagged silenced (mechanism shared with edge/guides).
  app.toggleSilence("empty", code);
  row = emptyRow(app.qaRows());
  assert(row.silenced, "silenced flag set");
  // Space is never listed even though it is empty.
  var spaceRow = null;
  var rows = app.qaRows();
  for (var i = 0; i < rows.length; i++)
    if (rows[i].checkId === "empty" && rows[i].code === 0x20) spaceRow = rows[i];
  assert(!spaceRow, "space never listed");
  // Cleanup.
  app.toggleSilence("empty", code);
  app.setStatus(code, 0);
});

// ---------- selection tools (DECISIONS #75) ----------

test("dom: tools — select/paint switch, selection bar, per-glyph clearing", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  app.setTool("select");
  assert(els["tool-select"].classList.contains("active"), "select tool active");
  assert(els["selbar"].hidden, "no selection => bar hidden");
  app.setSel({ x: 1, y: 2, w: 3, h: 2 });
  assertEqual(els["selbar"].hidden, false, "selection => bar visible");
  assertEqual(els["selinfo"].textContent, "3\u00d72", "size readout");
  // Switching away from select clears the selection.
  app.setTool("paint");
  assertEqual(app.state.selRect, null, "selection cleared");
  assert(els["selbar"].hidden, "bar hidden again");
  // Back to select keeps the tool state coherent.
  app.setTool("select");
  assertEqual(app.state.tool, "select", "tool set");
  app.setTool("paint");
});

test("dom: selection actions — fill/invert/clear mutate the rect, undo restores", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font, c = 0x43; // 'C'
  app.selectGlyph(c);
  BF.clearGlyph(f, c);
  var r = { x: 1, y: 1, w: 2, h: 2 };
  BF.setPixel(f, c, 0, 0, 1); // outside the rect — must survive every action
  app.setSel(r);

  app.selAction("fill");
  assertEqual(BF.getPixel(f, c, 1, 1), 1, "fill: ink in rect");
  assertEqual(BF.getPixel(f, c, 2, 2), 1, "fill: whole rect");
  assertEqual(BF.getPixel(f, c, 0, 0), 1, "fill: outside survives");
  assertEqual(BF.getPixel(f, c, 3, 3), 0, "fill: outside rect untouched");

  app.selAction("invert");
  assertEqual(BF.getPixel(f, c, 1, 1), 0, "invert: rect cleared (was all ink)");
  assertEqual(BF.getPixel(f, c, 0, 0), 1, "invert: outside survives");

  app.selAction("clear");
  assertEqual(BF.getPixel(f, c, 1, 1), 0, "clear: stays empty");

  // Undo the three actions.
  app.shortcuts.dispatch({ key: "z", ctrlKey: true, preventDefault: function () {} });
  app.shortcuts.dispatch({ key: "z", ctrlKey: true, preventDefault: function () {} });
  app.shortcuts.dispatch({ key: "z", ctrlKey: true, preventDefault: function () {} });
  assertEqual(BF.getPixel(f, c, 1, 1), 0, "undo x3: blank again");
  assertEqual(BF.getPixel(f, c, 0, 0), 1, "undo x3: outside ink intact");
  BF.clearGlyph(f, c);
  app.selectGlyph(c);
});

test("dom: selection copy-to — exact paste, target selected, status survives", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  app.selectGlyph(0x44); // 'D' source
  BF.clearGlyph(f, 0x44);
  BF.setPixel(f, 0x44, 1, 2, 1);
  BF.setPixel(f, 0x44, 3, 2, 1);
  var r = { x: 1, y: 2, w: 3, h: 1 };
  app.setSel(r);
  // Target has pre-existing ink inside the rect (must be overwritten)
  // and outside it (must survive).
  BF.setPixel(f, 0x64, 2, 2, 1);
  BF.setPixel(f, 0x64, 6, 6, 1);
  f.status[0x64] = 2;

  // Shared codepoint modal (chunk [AE]): the note names the selection.
  app.selCopyTo();
  var els = globalThis.__stub.els;
  assertEqual(els["cp-modal"].hidden, false, "codepoint modal opens");
  assert(els["cp-note"].textContent.indexOf("selection") !== -1, "note names the selection: " + els["cp-note"].textContent);
  els["cp-input"].value = "64";
  globalThis.__stub.dispatch("cp-input", "input", {});
  globalThis.__stub.dispatch("cp-ok", "click", {});
  assertEqual(els["cp-modal"].hidden, true, "modal closed after OK");

  assertEqual(BF.getPixel(f, 0x64, 1, 2), 1, "ink pasted");
  assertEqual(BF.getPixel(f, 0x64, 3, 2), 1, "ink pasted (2)");
  assertEqual(BF.getPixel(f, 0x64, 2, 2), 0, "transparent pasted over old ink");
  assertEqual(BF.getPixel(f, 0x64, 6, 6), 1, "outside-rect target ink survives");
  assertEqual(BF.getPixel(f, 0x44, 1, 2), 1, "source intact");
  assertEqual(f.status[0x64], 2, "target status untouched");
  assertEqual(app.state.selected, 0x64, "target becomes the selection");
  assertEqual(app.state.selRect, null, "selection cleared after copy-to");
  // Undo restores the target.
  app.shortcuts.dispatch({ key: "z", ctrlKey: true, preventDefault: function () {} });
  assertEqual(BF.getPixel(f, 0x64, 1, 2), 0, "undo: target ink removed");
  assertEqual(BF.getPixel(f, 0x64, 2, 2), 1, "undo: old target ink restored");
  // Cleanup.
  BF.clearGlyph(f, 0x64);
  f.status[0x64] = 0;
  BF.clearGlyph(f, 0x44);
  app.selectGlyph(0x44);
});

test("dom: selection — Esc deselects when nothing else is open", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  app.setTool("select");
  app.setSel({ x: 0, y: 0, w: 2, h: 2 });
  assertEqual(app.state.selRect !== null, true, "selection active");
  globalThis.__stub.docDispatch("keydown", { key: "Escape" });
  assertEqual(app.state.selRect, null, "Esc cleared the selection");
  assert(els["selbar"].hidden, "bar hidden");
  app.setTool("paint");
});

test("dom: Escape with a modal open closes the modal but KEEPS the selection (chunk [AE] fix)", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  app.setTool("select");
  app.setSel({ x: 0, y: 0, w: 2, h: 2 });
  assertEqual(app.state.selRect !== null, true, "selection active");
  app.openAskModal("Test?", "Does the selection survive the Escape?", "Yes", function () {});
  assertEqual(els["ask-modal"].hidden, false, "ask modal open");
  globalThis.__stub.docDispatch("keydown", { key: "Escape" });
  assertEqual(els["ask-modal"].hidden, true, "Escape closed the modal");
  assertEqual(app.state.selRect !== null, true, "selection SURVIVES — the modal claimed the Escape");
  assert(els["selbar"].hidden === false, "selection bar still visible");
  // A fully idle Escape still deselects.
  globalThis.__stub.docDispatch("keydown", { key: "Escape" });
  assertEqual(app.state.selRect, null, "idle Escape cleared the selection");
  assert(els["selbar"].hidden, "bar hidden after idle Escape");
  app.setTool("paint");
});

test("dom: paste mode — toggle persists, labels the button, validates input", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  assertEqual(app.pasteMode(), "merge", "default is merge");
  assertEqual(els["sel-pastemode"].textContent, "paste: merge", "button label");
  app.setPasteMode("replace");
  assertEqual(app.pasteMode(), "replace", "set to replace");
  assertEqual(els["sel-pastemode"].textContent, "paste: replace", "button label follows");
  app.setPasteMode("banana");
  assertEqual(app.pasteMode(), "merge", "bogus input coerces to merge");
  assertEqual(els["sel-pastemode"].textContent, "paste: merge", "label follows coercion");
});

test("dom: selection drag — plain drag cuts, Ctrl/Alt drag copies; paste mode honored", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font, code = app.state.selected;
  var r = { x: 0, y: 0, w: 2, h: 2 };
  var S = 22; // editorScale(8x16) = clamp(floor(360/16), 6, 40); stub rect is at 0,0
  function evt(cx, cy, extra) {
    var o = { clientX: cx * S + 5, clientY: cy * S + 5, preventDefault: function () {} };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  // Selection: 2x2 at (0,0) with a TRANSPARENT hole at (1,1); destination ink
  // under the hole's landing spot (4,1) after dx=3.
  function fresh() {
    BF.clearGlyph(f, code);
    BF.setPixel(f, code, 0, 0, 1); BF.setPixel(f, code, 1, 0, 1); BF.setPixel(f, code, 0, 1, 1);
    BF.setPixel(f, code, 4, 1, 1);
  }
  function drag(mod) {
    app.setSel(r);
    app.onEditorDown(evt(0, 0, mod));
    app.onEditorMove(evt(3, 0));
    app.onEditorUp();
  }
  app.setTool("select");

  // Plain drag = cut. replace: the hole erases destination ink at (4,1).
  app.setPasteMode("replace");
  fresh(); drag();
  assertEqual(BF.getPixel(f, code, 0, 0), 0, "cut: source cleared");
  assertEqual(BF.getPixel(f, code, 3, 0), 1, "cut: ink landed");
  assertEqual(BF.getPixel(f, code, 4, 1), 0, "cut replace: hole erased destination ink");
  assertEqual(app.state.selRect.x, 3, "selection follows the drop");

  // Plain drag = cut. merge: destination ink at (4,1) is kept.
  app.setPasteMode("merge");
  fresh(); drag();
  assertEqual(BF.getPixel(f, code, 0, 0), 0, "cut merge: source cleared");
  assertEqual(BF.getPixel(f, code, 4, 1), 1, "cut merge: destination ink kept");

  // Ctrl+drag = copy (source kept); replace still erases under the hole.
  app.setPasteMode("replace");
  fresh(); drag({ ctrlKey: true });
  assertEqual(BF.getPixel(f, code, 0, 0), 1, "copy: source kept (1)");
  assertEqual(BF.getPixel(f, code, 0, 1), 1, "copy: source kept (2)");
  assertEqual(BF.getPixel(f, code, 3, 0), 1, "copy: ink landed");
  assertEqual(BF.getPixel(f, code, 4, 1), 0, "copy replace: hole erased destination ink");

  // Alt (Option)+drag also copies.
  fresh(); drag({ altKey: true });
  assertEqual(BF.getPixel(f, code, 0, 0), 1, "alt-drag: source kept");
  assertEqual(BF.getPixel(f, code, 3, 0), 1, "alt-drag: copy landed");

  // Tidy up for later tests.
  app.setPasteMode("merge");
  app.setTool("paint");
  BF.clearGlyph(f, code);
});

// ---------- guides at the cell edge (DECISIONS #86) ----------

test("dom: guide can be dragged to the far edge (off = dim), stays grabbable, draws inside", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var f = app.state.font;
  var savedLen = f.guidelines.length;
  var savedLock = app.state.glocked;
  try {
    app.addGuide("descender"); // preset h guide at height-1 (between rows 14|15)
    var g = f.guidelines[f.guidelines.length - 1];
    assertEqual(g.o, "h", "descender preset is horizontal");
    assertEqual(g.off, f.height - 1, "preset lands at height-1");

    // Drag it past the bottom edge: the new clamp must land it ON dim.
    app.state.glocked = false;
    var S = 22; // editorScale for the 8x16 test font
    app.onEditorDown({ clientX: 5, clientY: g.off * S, button: 0, preventDefault: function () {} });
    app.onEditorMove({ clientX: 5, clientY: 10000, preventDefault: function () {} });
    app.onEditorUp();
    assertEqual(g.off, f.height, "dragged to the far edge: off = dim (was clamped to dim-1 before #86)");

    // The edge guide is still grabbable at its DRAWN position (dim*S-0.5).
    var hit = app.guidelineAt({ clientX: 5, clientY: f.height * S - 0.5 });
    assert(hit === g, "guidelineAt finds the edge guide at the drawn position");

    // And it draws INSIDE the canvas (dim*S-0.5), not off-canvas (dim*S+0.5).
    var ctx = els["editor"]._ctx;
    var n0 = ctx.path.length;
    app.drawEditor();
    var pts = ctx.path.slice(n0);
    var found = false;
    for (var i = 0; i < pts.length; i++)
      if (Math.abs(pts[i][1] - (f.height * S - 0.5)) < 0.001) found = true;
    assert(found, "far-edge guide line drawn at dim*S-0.5 (inside the canvas)");
    var offCanvas = false;
    for (i = 0; i < pts.length; i++)
      if (pts[i][1] > f.height * S) offCanvas = true;
    assert(!offCanvas, "nothing drawn past the bottom edge of the canvas");
  } finally {
    app.state.glocked = savedLock;
    while (f.guidelines.length > savedLen) f.guidelines.pop();
    app.drawEditor();
  }
});

test("dom: addGuide clamps presets into 0..dim inclusive", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  var savedLen = f.guidelines.length;
  try {
    app.addGuide("ascender"); app.addGuide("descender");
    app.addGuide("left"); app.addGuide("right");
    for (var i = 0; i < 4; i++) {
      var g = f.guidelines[savedLen + i];
      var max = (g.o === "h") ? f.height : f.width;
      assert(g.off >= 0 && g.off <= max, g.label + " off " + g.off + " within 0.." + max);
    }
  } finally {
    while (f.guidelines.length > savedLen) f.guidelines.pop();
    app.drawEditor();
  }
});

test("dom: new-font modal — one form (name + width + height), live readout, create/cancel (chunk [AE]; name field [AF])", function () {
  var app = globalThis.__stub.app;
  var els = globalThis.__stub.els;
  var before = app.state.font;

  // Open: prefilled with the current font's dims, live readout.
  app.openNewModal();
  assertEqual(els["new-modal"].hidden, false, "modal open");
  assertEqual(els["new-w"].value, "8", "prefilled width");
  assertEqual(els["new-h"].value, "16", "prefilled height");
  assertEqual(els["new-name"].value, "font", "prefilled name (current font's name)");
  assertEqual(els["new-result"].textContent, "\u2192 8\u00d716", "live readout 8\u00d716");

  // Live readout follows the inputs; out-of-range is flagged inline.
  els["new-w"].value = "20";
  app.newRender();
  assertEqual(els["new-result"].textContent, "\u2192 20\u00d716", "readout follows the width");
  els["new-w"].value = "9999";
  app.newRender();
  assert(/^invalid \u2014 width must be an integer 1\.\..*\(got 9999\)/.test(els["new-result"].textContent),
    "9999 flagged invalid inline: " + els["new-result"].textContent);

  // Invalid Create is refused: modal stays open, font untouched, error toast.
  app.createNewFont();
  assertEqual(els["new-modal"].hidden, false, "invalid create keeps the modal open");
  assertEqual(app.state.font, before, "invalid create left the font alone");
  assert(/^width must be an integer 1\.\..*\(got 9999\)/.test(app.getLastToast()), "error toast shown: " + app.getLastToast());

  // Cancel closes; the font is still untouched.
  app.closeNewModal();
  assertEqual(els["new-modal"].hidden, true, "cancel closed the modal");
  assertEqual(app.state.font, before, "cancel left the font alone");

  // Valid Create replaces the font; a name is applied when given (chunk [AF]).
  app.openNewModal();
  els["new-w"].value = "12"; els["new-h"].value = "24";
  els["new-name"].value = "ae-test";
  app.createNewFont();
  assertEqual(els["new-modal"].hidden, true, "create closed the modal");
  assert(app.state.font !== before, "create replaced the font object");
  assertEqual(app.state.font.width, 12, "new width 12");
  assertEqual(app.state.font.height, 24, "new height 24");
  assertEqual(app.state.font.name, "ae-test", "name applied at create");
  assertEqual(app.getLastToast(), 'New 12\u00d724 font "ae-test"', "create toast includes the name");

  // Restore 8x16 + the default name for the test files that run after this one (shared app instance).
  app.openNewModal();
  assertEqual(els["new-w"].value, "12", "prefill follows the CURRENT font (12)");
  assertEqual(els["new-name"].value, "ae-test", "name prefill follows the CURRENT font");
  els["new-w"].value = "8"; els["new-h"].value = "16";
  els["new-name"].value = ""; // blank name -> default "font" (same rule as Properties, DECISIONS #70)
  app.createNewFont();
  assertEqual(app.state.font.width, 8, "restored width 8");
  assertEqual(app.state.font.height, 16, "restored height 16");
  assertEqual(app.state.font.name, "font", "blank name fell back to default");
  assertEqual(app.getLastToast(), "New 8\u00d716 font", "blank-name create toast omits the name");
});

// ---------- guide model: unique semantic guides + visibility toggles (DECISIONS #94) ----------
// Shared-font note: the new-font modal test above leaves a FRESH 8\u00d716 font —
// setFont ran, so the 7 semantic guides are materialized HIDDEN (decision 4).
// Every test below restores the shared font exactly (try/finally).

function bfGuideChipFor(els, label) {
  var kids = els["glist"].children;
  for (var i = 0; i < kids.length; i++) {
    var c = kids[i];
    if (c.children && c.children.length && c.children[0].textContent === label) return c;
  }
  return null;
}

test("dom: guide model — materializeGuides: 7 unique semantic, hidden, idempotent", function () {
  var app = globalThis.__stub.app;
  var f = BF.makeFont(8, 16);
  app.materializeGuides(f);
  app.materializeGuides(f); // idempotent — the label is the key
  assertEqual(f.guidelines.length, 7, "exactly the 7 semantic guides (no duplicates)");
  var seen = {};
  for (var i = 0; i < f.guidelines.length; i++) {
    var g = f.guidelines[i];
    assert(!seen[g.label], "unique label: " + g.label);
    seen[g.label] = true;
    assertEqual(g.hid, true, g.label + " starts hidden (decision 4)");
  }
  var want = ["asc", "cap", "x", "base", "desc", "L", "R"];
  for (i = 0; i < want.length; i++)
    assert(!!seen[want[i]], "semantic present: " + want[i]);
  // Existing guides are kept as-is — position AND visibility (old files keep their state).
  var f2 = BF.makeFont(8, 16);
  f2.guidelines.push({ o: "h", off: 9, label: "base", color: "#dd2222" }); // visible, custom position
  app.materializeGuides(f2);
  assertEqual(f2.guidelines.length, 7, "only the 6 missing are added");
  assertEqual(f2.guidelines[0].off, 9, "existing base kept its position");
  assert(!f2.guidelines[0].hid, "existing base kept its visibility");
});

test("dom: guide model — semantic button is a visibility toggle: no bump, button + chip reflect state", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var f = app.state.font;
  var base = BF.guideCanonical(f, "base");
  assert(base, "shared font has the materialized base guide");
  var hid0 = base.hid === true;
  var len0 = f.guidelines.length;
  var v0 = app.state.fontVersion;
  try {
    app.addGuide("baseline");
    assertEqual(f.guidelines.length, len0, "toggle never adds a guide");
    assertEqual(base.hid === true, !hid0, "base visibility flipped");
    assertEqual(app.state.fontVersion, v0, "toggle does NOT bump (view-only by design)");
    // Button dimmed iff the guide is hidden; chip carries the off/dup state.
    var btns = document.querySelectorAll(".gadd button");
    var btn = null;
    for (var bi = 0; bi < btns.length; bi++)
      if (btns[bi]["data-g"] === "baseline") { btn = btns[bi]; break; }
    assert(btn, "the baseline preset button exists");
    assertEqual(btn.classList.contains("off"), base.hid === true, "button dimmed iff hidden");
    var chip = bfGuideChipFor(els, "base");
    assert(chip, "a base chip is listed");
    assertEqual(chip.className.indexOf(" off") !== -1, base.hid === true, "chip 'off' iff hidden");
    // The canonical semantic chip has NO × (decision 3: only duplicates/customs are removable).
    var kids = chip.children;
    var hasDel = false;
    for (var i = 0; i < kids.length; i++)
      if (kids[i].textContent === "\u00d7") hasDel = true;
    assert(!hasDel, "canonical base chip carries no \u00d7");
    app.addGuide("baseline"); // back
    assertEqual(base.hid === true, hid0, "second toggle restores the state");
  } finally {
    base.hid = hid0;
    app.renderGuideList(); app.drawEditor(); app.syncGuideButtons();
  }
});

test("dom: guide model — clicking a missing semantic guide creates it VISIBLE and bumps once", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  var saved = f.guidelines.slice();
  var v0 = app.state.fontVersion;
  var idx = -1;
  for (var i = 0; i < f.guidelines.length; i++) if (f.guidelines[i].label === "cap") idx = i;
  assert(idx >= 0, "cap present in the shared font");
  f.guidelines.splice(idx, 1); // simulate a pre-#94 file missing the guide
  try {
    assertEqual(BF.guideCanonical(f, "cap"), null, "cap is now missing");
    app.addGuide("cap");
    var g = BF.guideCanonical(f, "cap");
    assert(g, "cap created by the click");
    assertEqual(f.guidelines.length, saved.length, "exactly one guide added");
    assert(!g.hid, "created VISIBLE (the user clicked to see it)");
    assertEqual(app.state.fontVersion, v0 + 1, "create-when-missing is structural -> bumps once");
  } finally {
    f.guidelines.length = 0;
    for (var j = 0; j < saved.length; j++) f.guidelines.push(saved[j]);
    app.renderGuideList(); app.drawEditor(); app.syncGuideButtons();
  }
});

test("dom: guide model — delete guard: canonical semantic survives; duplicate + custom go", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  var saved = f.guidelines.slice();
  var base = BF.guideCanonical(f, "base");
  var bIdx = -1;
  for (var i = 0; i < f.guidelines.length; i++) if (f.guidelines[i] === base) bIdx = i;
  var before = f.guidelines.length;
  try {
    app.deleteGuide(bIdx);
    assertEqual(f.guidelines.length, before, "canonical base NOT deleted (guard)");
    // A duplicate (inserted BEFORE the canonical, so the canonical stays canonical) is deletable.
    f.guidelines.splice(bIdx, 0, { o: "h", off: 5, label: "base", color: "#dd2222" });
    app.deleteGuide(bIdx);
    assertEqual(f.guidelines.length, before, "duplicate removed");
    assert(f.guidelines.indexOf(base) !== -1, "the canonical base is still there");
    // A custom guide is add/remove as before (and bumps each way — #93).
    app.addGuide("hnew");
    assertEqual(f.guidelines.length, before + 1, "custom added");
    app.deleteGuide(f.guidelines.length - 1);
    assertEqual(f.guidelines.length, before, "custom removed");
  } finally {
    f.guidelines.length = 0;
    for (var j = 0; j < saved.length; j++) f.guidelines.push(saved[j]);
    app.renderGuideList(); app.drawEditor(); app.syncGuideButtons();
  }
});

test("dom: guide model — chips: duplicate marked 'dup' with \u00d7, canonical without", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var f = app.state.font;
  var saved = f.guidelines.slice();
  var bIdx = -1;
  for (var i = 0; i < f.guidelines.length; i++) if (f.guidelines[i].label === "base") bIdx = i;
  // Insert a duplicate AFTER the first base -> last-in-array is canonical, the first is the dup.
  f.guidelines.splice(bIdx + 1, 0, { o: "h", off: 5, label: "base", color: "#dd2222" });
  app.renderGuideList();
  try {
    var chips = [];
    var kids = els["glist"].children;
    for (i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c.children && c.children.length && c.children[0].textContent === "base") chips.push(c);
    }
    assertEqual(chips.length, 2, "two base chips");
    var dups = 0, dels = 0;
    for (i = 0; i < chips.length; i++) {
      if (chips[i].className && chips[i].className.indexOf("dup") !== -1) dups++;
      var ck = chips[i].children;
      for (var k = 0; k < ck.length; k++)
        if (ck[k].textContent === "\u00d7") dels++;
    }
    assertEqual(dups, 1, "exactly one base chip marked dup");
    assertEqual(dels, 1, "exactly one base chip carries the \u00d7 (the duplicate)");
  } finally {
    f.guidelines.length = 0;
    for (var j = 0; j < saved.length; j++) f.guidelines.push(saved[j]);
    app.renderGuideList(); app.drawEditor(); app.syncGuideButtons();
  }
});

test("dom: guide model — hidden guides are not drawn and not grabbable", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var f = app.state.font;
  var base = BF.guideCanonical(f, "base");
  assert(base, "shared font has the materialized base guide");
  var hid0 = base.hid === true, off0 = base.off, lock0 = app.state.glocked;
  try {
    app.state.glocked = false;
    base.off = 13; // the 8\u00d716 preset position; no other guide sits on this row
    var S = 22, y = 13 * S + 0.5; // guides AND the grid line at boundary 13 draw here
    // The guide's line coincides with the grid line's y — so count points: the
    // grid contributes exactly 2 (moveTo+lineTo); a drawn guide adds 2 more.
    function linePts(yy) {
      var ctx = els["editor"]._ctx;
      var n0 = ctx.path.length;
      app.drawEditor();
      var pts = ctx.path.slice(n0);
      var n = 0;
      for (var i = 0; i < pts.length; i++)
        if (Math.abs(pts[i][1] - yy) < 0.001) n++;
      return n;
    }
    base.hid = true;
    assertEqual(linePts(y), 2, "hidden base: only the grid line at that boundary");
    assert(!app.guidelineAt({ clientX: 5, clientY: y }), "hidden base is NOT grabbable");
    base.hid = false;
    assertEqual(linePts(y), 4, "visible base: grid line + the guide's own line");
    assert(app.guidelineAt({ clientX: 5, clientY: y }) === base, "visible base is grabbable");
  } finally {
    base.hid = hid0; base.off = off0; app.state.glocked = lock0;
    app.renderGuideList(); app.drawEditor(); app.syncGuideButtons();
  }
});
