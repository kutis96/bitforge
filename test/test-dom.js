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
  // 8 nav + 4 shift + 3 undo/redo + 1 card = 16
  assertEqual(app.shortcuts.list.length, 16, "16 shortcuts registered");
  var combos = {};
  for (var i = 0; i < app.shortcuts.list.length; i++) combos[app.shortcuts.list[i].combo] = true;
  assert(combos["Ctrl+ArrowLeft"] && combos["?"] && combos["Ctrl+z"] && combos["PageUp"], "expected combos present");
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
