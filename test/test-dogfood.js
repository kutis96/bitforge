/* bitforge — dogfooding + TTF export (chunk [Z], DECISIONS #82).
 * Needs the DOM stub + app.js loaded (see test/run.js ordering), like the
 * theme tests. Covers: the setting default, the toggle (<html> tag + menu
 * check), the injected @font-face CSS, the blank-glyphs-unmapped safety
 * rule, and the .ttf export naming. */

function bfDogfoodRestore() {
  var app = globalThis.__stub.app;
  app.settingsSet("dogfood", false);
  app.applyDogfood(); // clears the <html> tag, the tracked style and the menu check
}

test("dogfood: setting is registered and defaults off", function () {
  var app = globalThis.__stub.app;
  assert("dogfood" in app.settingsDefaults(), "dogfood is a registered setting (settingsDefaults)");
  assertEqual(app.settingsGet("dogfood"), false, "defaults to off");
});

test("dogfood: toggle tags <html>, syncs the menu check; off clears both", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  try {
    app.applyDogfood(); // ensure a clean start
    assertEqual(document.documentElement.getAttribute("data-dogfood"), null, "off: no <html> tag");
    assert(!els["mi-dogfood"].classList.contains("active"), "off: no menu check");
    app.toggleDogfood();
    assertEqual(app.settingsGet("dogfood"), true, "on: setting persisted");
    assertEqual(document.documentElement.getAttribute("data-dogfood"), "1", "on: <html> tagged");
    assert(els["mi-dogfood"].classList.contains("active"), "on: menu check shown");
    app.toggleDogfood();
    assertEqual(app.settingsGet("dogfood"), false, "off again");
    assertEqual(document.documentElement.getAttribute("data-dogfood"), null, "off: tag removed");
    assert(!els["mi-dogfood"].classList.contains("active"), "off: check cleared");
  } finally { bfDogfoodRestore(); }
});

test("dogfood: guideline changes schedule a live rebuild (structural yes, toggle no)", function () {
  // DECISIONS #94 semantics: a VISIBILITY TOGGLE is view-only (no bump —
  // hidden guides still drive the TTF baseline + QA bounds, by design). A
  // STRUCTURAL change (custom add/remove, a guide move) is a font mutation:
  // with dogfood ON it queues the debounced TTF rebuild; with dogfood OFF it
  // must not.
  var app = globalThis.__stub.app;
  var f = app.state.font;
  var savedLen = f.guidelines.length;
  var savedLock = app.state.glocked;
  var base = BF.guideCanonical(f, "base");
  var baseOff0 = base ? base.off : null;
  var baseHid0 = base ? base.hid === true : false;
  try {
    assert(base, "shared app font has a materialized base guide (setFont ran)");

    // OFF: nothing may be queued.
    app.settingsSet("dogfood", false);
    app.applyDogfood();
    assertEqual(app.dogfoodPending(), false, "clean start: no rebuild queued");
    app.addGuide("baseline"); // visibility toggle
    assertEqual(app.dogfoodPending(), false, "off: semantic toggle does not schedule");
    app.addGuide("hnew");     // custom add (structural)
    assertEqual(app.dogfoodPending(), false, "off: custom add does not schedule");
    app.deleteGuide(f.guidelines.length - 1);
    assertEqual(app.dogfoodPending(), false, "off: custom delete does not schedule");

    // ON: structural changes queue the debounced rebuild; toggles do not.
    app.settingsSet("dogfood", true);
    app.applyDogfood();
    assertEqual(app.dogfoodPending(), false, "on: clean start, no rebuild queued");

    app.addGuide("baseline"); // toggle (view-only)
    assertEqual(app.dogfoodPending(), false, "on: visibility toggle does NOT schedule (view-only by design)");

    app.addGuide("hnew");
    assertEqual(app.dogfoodPending(), true, "on: custom add schedules a rebuild");
    app.deleteGuide(f.guidelines.length - 1);
    assertEqual(app.dogfoodPending(), true, "on: custom delete schedules a rebuild");
    app.applyDogfood(); // manual rebuild: supersedes the queued one (no real-time wait needed)
    assertEqual(app.dogfoodPending(), false, "applyDogfood flushes the pending rebuild");

    // Move: make the base guide visible (toggle — no schedule), then drag it.
    if (base.hid) app.addGuide("baseline");
    assertEqual(app.dogfoodPending(), false, "on: the enabling toggle queued nothing");
    app.state.glocked = false;
    var S = 22; // editorScale for the 8x16 test font (same as the [AB] edge-guide test)
    app.onEditorDown({ clientX: 5, clientY: baseOff0 * S, button: 0, preventDefault: function () {} });
    app.onEditorMove({ clientX: 5, clientY: (baseOff0 - 1) * S, preventDefault: function () {} });
    app.onEditorUp();
    assertEqual(base.off, baseOff0 - 1, "base guide moved one row up (drag flow executed)");
    assertEqual(app.dogfoodPending(), true, "on: moveGuide (drag) schedules a rebuild");

    assertEqual(f.guidelines.length, savedLen, "guidelines restored to the original set");
  } finally {
    app.state.glocked = savedLock;
    if (base) { base.off = baseOff0; base.hid = baseHid0; } // restore the shared font exactly
    while (f.guidelines.length > savedLen) f.guidelines.pop();
    app.renderGuideList(); app.drawEditor(); app.syncGuideButtons();
    bfDogfoodRestore();
  }
});

test("dogfood: injected @font-face uses family bf-dogfood with an embedded TTF", function () {
  var app = globalThis.__stub.app;
  try {
    app.settingsSet("dogfood", true);
    app.applyDogfood();
    var css = app.dogfoodCSS();
    assert(css.indexOf("@font-face") === 0, "CSS starts with @font-face");
    assert(css.indexOf('font-family: "bf-dogfood"') !== -1,
      "fixed family name — css/style.css anchors the data-dogfood rule on it");
    assert(css.indexOf("data:font/ttf;base64,") !== -1, "TTF embedded as a data URI");
    assert(css.indexOf('format("truetype")') !== -1, "format hint present");
    var st = app.dogfoodStyle();
    assert(st, "the injected <style> is tracked");
    assertEqual(st.id, "bf-dogfood", "style id");
    assertEqual(st.textContent, css, "injected CSS == dogfoodCSS()");
    app.settingsSet("dogfood", false);
    app.applyDogfood();
    assertEqual(app.dogfoodStyle(), null, "off: no tracked style element");
  } finally { bfDogfoodRestore(); }
});

test("dogfood: blank glyphs are UNMAPPED in the injected TTF (fallback rule)", function () {
  // Only 0x41 inked: 'A' must map to a real glyph; every other code (incl.
  // 0x20? no — space keeps its slot) must be unmapped so the renderer falls
  // back per-codepoint. Reuses the spec-conformant cmap reader from
  // test-ttf.js (loaded earlier in run.js).
  var f = BF.makeFont(8, 16);
  BF.setPixel(f, 0x41, 0, 3, 1);
  var b = BF_TTF.build(f, "bf-dogfood");
  var t = ttfTables(b);
  assert(cmapGlyph(b, t.cmap, 0x41) != null, "'A' (inked) is mapped");
  assertEqual(cmapGlyph(b, t.cmap, 0x20), 1, "space keeps its slot (advance width)");
  assertEqual(cmapGlyph(b, t.cmap, 0x42), null, "'B' (blank) unmapped");
  assertEqual(cmapGlyph(b, t.cmap, 0x61), null, "'a' (blank) unmapped");
  assertEqual(cmapGlyph(b, t.cmap, 0x00), null, "NUL (blank) unmapped");
});

test("exportTtf: downloads <font name>.ttf", function () {
  var app = globalThis.__stub.app, stub = globalThis.__stub;
  var savedName = app.state.font.name;
  try {
    app.state.font.name = "cozy test";
    var n0 = stub.downloads.length;
    app.exportTtf();
    assertEqual(stub.downloads.length, n0 + 1, "one download recorded");
    assertEqual(stub.downloads[stub.downloads.length - 1], "cozy test.ttf",
      "file named after the font (like every other export)");
  } finally { app.state.font.name = savedName; }
});
