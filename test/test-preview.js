/* bitforge — Preview head controls (chunk [AC], DECISIONS #87).
 * Needs the DOM stub + app.js loaded (see test/run.js ordering). */

test("preview: new head settings have defaults (wrap on, text box on, insert off)", function () {
  var app = globalThis.__stub.app;
  assertEqual(app.settingsGet("pvWrap"), true, "pvWrap defaults on");
  assertEqual(app.settingsGet("pvShowText"), true, "pvShowText defaults on");
  assertEqual(app.settingsGet("pvInsert"), false, "pvInsert defaults off");
});

test("preview: wrap OFF disables soft-wrap (one long row: wider + shorter canvas)", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var savedText = els["pv-text"].value;
  var savedWrap = app.settingsGet("pvWrap");
  try {
    els["pv-text"].value = "aaaaaaaaaaaaaaaaaaaaaaaa"; // 24 glyphs, one source row
    app.setPvWrap(true);
    var wWrap = els["pv-text-canvas"].width, hWrap = els["pv-text-canvas"].height;
    app.setPvWrap(false);
    var wNo = els["pv-text-canvas"].width, hNo = els["pv-text-canvas"].height;
    assert(wNo > wWrap, "nowrap canvas is wider (" + wNo + " > " + wWrap + ")");
    assert(hNo < hWrap, "nowrap canvas is shorter — one row (" + hNo + " < " + hWrap + ")");
  } finally {
    els["pv-text"].value = savedText;
    app.setPvWrap(savedWrap);
  }
});

test("preview: text-box toggle hides the textarea + markup note", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var saved = app.settingsGet("pvShowText");
  // The stub's elements default to hidden:true; the real DOM defaults visible —
  // establish the real default first, then drive the toggle.
  els["pv-text"].hidden = false; els["pv-markup-note"].hidden = false;
  try {
    app.setPvShowText(false);
    assert(els["pv-text"].hidden, "textarea hidden");
    assert(els["pv-markup-note"].hidden, "markup note hidden");
    app.setPvShowText(true);
    assert(!els["pv-text"].hidden, "textarea visible again");
    assert(!els["pv-markup-note"].hidden, "note visible again");
  } finally {
    app.setPvShowText(saved);
  }
});

test("preview: click-to-add inserts \\uXX at the cursor on selector double-click", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var savedInsert = app.settingsGet("pvInsert");
  var savedTab = app.state.activeTab;
  var savedText = els["pv-text"].value;
  try {
    els["pv-text"].value = "ab";
    els["pv-text"].selectionStart = 1;
    els["pv-text"].selectionEnd = 1;
    app.state.activeTab = "preview";
    app.setPvInsert(true);
    // col 1, row 0 = 0x01
    globalThis.__stub.dispatch("selector", "dblclick", { clientX: 16 + 8, clientY: 0 + 8 });
    assertEqual(els["pv-text"].value, "a\\u01b", "inserted at the cursor");
    assertEqual(app.settingsGet("pvText"), "a\\u01b", "pvText setting follows");

    // A selection is replaced by the insert.
    els["pv-text"].value = "xyz";
    els["pv-text"].selectionStart = 0;
    els["pv-text"].selectionEnd = 2;
    globalThis.__stub.dispatch("selector", "dblclick", { clientX: 2 * 16 + 8, clientY: 1 * 16 + 8 }); // col 2 row 1 = 0x12
    assertEqual(els["pv-text"].value, "\\u12z", "selection replaced by the insert");

    // Gated: the Edit tab is active -> no insert.
    els["pv-text"].value = "cd";
    els["pv-text"].selectionStart = 0; els["pv-text"].selectionEnd = 0;
    app.state.activeTab = "edit";
    globalThis.__stub.dispatch("selector", "dblclick", { clientX: 16 + 8, clientY: 8 });
    assertEqual(els["pv-text"].value, "cd", "no insert when the Edit tab is active");

    // Gated: the setting is off -> no insert.
    app.state.activeTab = "preview";
    app.setPvInsert(false);
    globalThis.__stub.dispatch("selector", "dblclick", { clientX: 16 + 8, clientY: 8 });
    assertEqual(els["pv-text"].value, "cd", "no insert with click-to-add off");
  } finally {
    app.state.activeTab = savedTab;
    app.setPvInsert(savedInsert);
    els["pv-text"].value = savedText;
    delete els["pv-text"].selectionStart;
    delete els["pv-text"].selectionEnd;
    app.drawPvText();
  }
});