/* bitforge — remember the last selected glyph (chunk [X], DECISIONS #80).
 * Needs the DOM stub + app.js loaded (see test/run.js ordering).
 * Covers: select ⇒ persisted; import-with-key ⇒ restored; import-without-key
 * ⇒ untouched; clamp; and the exported project text carrying the setting.
 * (The init() restore line is the same settingsGet path as test 1; init itself
 * runs once under the stub before tests, so it is covered by the same seam.) */

function bfSelSave() { return globalThis.localStorage.getItem("bitforge.settings.v1"); }
function bfSelRestore(saved) {
  if (saved == null) globalThis.localStorage.removeItem("bitforge.settings.v1");
  else globalThis.localStorage.setItem("bitforge.settings.v1", saved);
}
// Restore a test's side effects: the settings blob, any single setting the test
// flipped, and the selection (selectGlyph re-persists selCode last).
function bfSelUndo(app, saved, oldSel, undoSetting) {
  bfSelRestore(saved);
  if (undoSetting) app.settingsSet(undoSetting.k, undoSetting.v);
  app.selectGlyph(oldSel);
}

test("selcode: selecting a glyph persists it (settings + localStorage blob)", function () {
  var app = globalThis.__stub.app;
  var saved = bfSelSave(), oldSel = app.state.selected;
  try {
    app.selectGlyph(66);
    assertEqual(app.state.selected, 66, "selection moved to 0x42");
    assertEqual(app.settingsGet("selCode"), 66, "selCode setting updated");
    var blob = JSON.parse(globalThis.localStorage.getItem("bitforge.settings.v1"));
    assertEqual(blob.selCode, 66, "selCode inside the persisted settings blob");
  } finally { bfSelUndo(app, saved, oldSel, null); }
});

test("selcode: importing a project that carries selCode re-selects it", function () {
  var app = globalThis.__stub.app;
  var saved = bfSelSave(), oldSel = app.state.selected;
  try {
    app.selectGlyph(1);
    app.applyImportedSettings({ selCode: 66 });
    assertEqual(app.state.selected, 66, "imported selCode restored the selection");
    assertEqual(app.settingsGet("selCode"), 66, "setting now carries the imported value");
    // Out-of-range values clamp like every other selection path.
    app.applyImportedSettings({ selCode: 999 });
    assertEqual(app.state.selected, 255, "bogus selCode clamps to 0xFF");
  } finally { bfSelUndo(app, saved, oldSel, null); }
});

test("selcode: importing a project WITHOUT selCode leaves the selection alone", function () {
  var app = globalThis.__stub.app;
  var saved = bfSelSave(), oldSel = app.state.selected;
  // Pick a pvScale value guaranteed to differ, so applyImportedSettings takes
  // its restore path (changed=true) without touching selCode at all.
  var oldScale = app.settingsGet("pvScale");
  var otherScale = oldScale === 3 ? 4 : 3;
  try {
    app.selectGlyph(10);
    app.applyImportedSettings({ pvScale: otherScale });
    assertEqual(app.settingsGet("pvScale"), otherScale, "the other setting was applied (path taken)");
    assertEqual(app.state.selected, 10, "selection untouched by a selCode-less import");
  } finally { bfSelUndo(app, saved, oldSel, { k: "pvScale", v: oldScale }); }
});

test("selcode: exported project text carries the current selCode", function () {
  var app = globalThis.__stub.app;
  var saved = bfSelSave(), oldSel = app.state.selected;
  try {
    app.selectGlyph(79);
    var o = JSON.parse(app.projectExportText("full")); // selCode rides the full (and sample) exports (DECISIONS #91)
    assert(o && o.settings, "export has a settings object");
    assertEqual(o.settings.selCode, 79, "selCode rides the .bitforge export");
  } finally { bfSelUndo(app, saved, oldSel, null); }
});

test("selcode: default is 0 (a fresh profile starts at 0x00)", function () {
  // Guard the real defaults table (init restores from it on a clean profile;
  // settingsDefaults is exposed on the test seam for exactly this).
  var app = globalThis.__stub.app;
  assertEqual(app.settingsDefaults().selCode, 0, "default selCode = 0");
  assert(typeof app.settingsDefaults().selCode === "number",
    "selCode is typed as a number (loadSettings type-gates per default type)");
});
