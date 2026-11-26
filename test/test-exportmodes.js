/* bitforge — .bitforge export modes: clean / sample / full (DECISIONS #91).
 * Needs the DOM stub + app.js loaded (see test/run.js ordering; this file is
 * registered after the DOM tests so the shared app instance is initialized).
 * Covers: the mode → settings curation, the sample-presentation toggle, the
 * Project-menu wiring, and the two shortcuts. The READER side (importing
 * clean/sample files with missing or partial settings) is covered by
 * test-project.js — the split is write-side curation only. */

function bfExpSave() { return globalThis.localStorage.getItem("bitforge.settings.v1"); }
function bfExpRestore(saved) {
  if (saved == null) globalThis.localStorage.removeItem("bitforge.settings.v1");
  else globalThis.localStorage.setItem("bitforge.settings.v1", saved);
}
function bfExpKeys(app, mode) {
  // The settings keys a mode's export carries; null = no settings key at all.
  var o = JSON.parse(app.projectExportText(mode));
  if (!o.settings) return null;
  var k = [];
  for (var n in o.settings) k.push(n);
  return k.sort();
}
function bfExpDefaultKeys(app) {
  var k = Object.keys(app.settingsDefaults());
  k.sort();
  return k;
}

test("exportmodes: clean carries no settings; sample exactly the two; full everything", function () {
  var app = globalThis.__stub.app;
  var saved = bfExpSave(), oldToggle = app.settingsGet("cleanPresentation");
  app.setCleanPresentation(false);
  try {
    assertEqual(bfExpKeys(app, "clean"), null, "clean export has NO settings key");
    assertEqual(bfExpKeys(app), null, "no-arg projectExportText() = clean (the source default)");
    assertEqual(bfExpKeys(app, "bogus"), null, "unknown mode degrades to clean");
    assertEqual(bfExpKeys(app, "sample").join(","), "pvText,selCode", "sample = selCode + pvText only");
    assertEqual(bfExpKeys(app, "full").join(","), bfExpDefaultKeys(app).join(","), "full = every setting");
    assertEqual(bfExpKeys(app, "full").length, 16, "16 settings in full (15 + cleanPresentation)");
    // sample carries the CURRENT values of the two settings
    app.settingsSet("pvText", "sample-value");
    var o = JSON.parse(app.projectExportText("sample"));
    assertEqual(o.settings.pvText, "sample-value", "sample pvText = the current value");
    assertEqual(o.settings.selCode, app.settingsGet("selCode"), "sample selCode = the current value");
    app.settingsSet("pvText", "");
  } finally {
    app.settingsSet("cleanPresentation", oldToggle);
    bfExpRestore(saved);
  }
});

test("exportmodes: sample-presentation toggle turns clean into sample", function () {
  var app = globalThis.__stub.app;
  var stub = globalThis.__stub;
  var saved = bfExpSave(), oldToggle = app.settingsGet("cleanPresentation");
  try {
    app.setCleanPresentation(true);
    assertEqual(app.settingsGet("cleanPresentation"), true, "toggle persisted via the settings API");
    assert(stub.els["mi-clean-presentation"].classList.contains("active"), "menu item checked when on");
    assertEqual(bfExpKeys(app, "clean").join(","), "pvText,selCode", "clean-with-toggle == sample (exactly the two)");
    assertEqual(bfExpKeys(app, "full").length, Object.keys(app.settingsDefaults()).length, "full is unaffected by the toggle");
    app.setCleanPresentation(false);
    assert(!stub.els["mi-clean-presentation"].classList.contains("active"), "menu item unchecked when off");
    assertEqual(bfExpKeys(app, "clean"), null, "back to clean (no settings)");
    // default is OFF: a clean profile starts with a clean clean-export
    assertEqual(app.settingsDefaults().cleanPresentation, false, "cleanPresentation defaults to false");
  } finally {
    app.settingsSet("cleanPresentation", oldToggle);
    bfExpRestore(saved);
  }
});

test("exportmodes: Project menu items export the right mode (download wiring)", function () {
  var stub = globalThis.__stub;
  var before = stub.downloads.length;
  stub.dispatch("mi-clean-presentation", "click", {});
  assertEqual(stub.downloads.length, before, "the toggle downloads nothing");
  stub.dispatch("mi-export-project-clean", "click", {});
  stub.dispatch("mi-export-project-full", "click", {});
  assertEqual(stub.downloads.length, before + 2, "both export items downloaded a file");
  assert(/\.bitforge$/.test(stub.downloads[before]), "clean item → .bitforge file");
  assert(/\.bitforge$/.test(stub.downloads[before + 1]), "full item → .bitforge file");
  stub.downloads.length = 0;
});

test("exportmodes: Alt+Shift+P exports clean, Alt+Shift+F exports full", function () {
  var app = globalThis.__stub.app;
  var stub = globalThis.__stub;
  var combos = {};
  for (var i = 0; i < app.shortcuts.list.length; i++) combos[app.shortcuts.list[i].combo] = app.shortcuts.list[i];
  assert(combos["Alt+Shift+p"] && combos["Alt+Shift+f"], "both project-export shortcuts registered");
  assertEqual(combos["Alt+Shift+p"].description, "Export project file (clean)", "clean description");
  assertEqual(combos["Alt+Shift+f"].description, "Export project file (full)", "full description");
  globalThis.document.activeElement = null; // the dispatcher suppresses shortcuts while typing
  var before = stub.downloads.length;
  app.shortcuts.dispatch({ key: "p", altKey: true, shiftKey: true, code: "KeyP", preventDefault: function () {} });
  app.shortcuts.dispatch({ key: "f", altKey: true, shiftKey: true, code: "KeyF", preventDefault: function () {} });
  assertEqual(stub.downloads.length, before + 2, "both shortcuts downloaded a .bitforge");
  assert(/\.bitforge$/.test(stub.downloads[before]), "Alt+Shift+P → .bitforge");
  assert(/\.bitforge$/.test(stub.downloads[before + 1]), "Alt+Shift+F → .bitforge");
  stub.downloads.length = 0;
});

test("exportmodes: exportProjectSettings is the single curation point", function () {
  var app = globalThis.__stub.app;
  var saved = bfExpSave(), oldToggle = app.settingsGet("cleanPresentation");
  try {
    app.setCleanPresentation(false);
    assertEqual(app.exportProjectSettings("clean"), undefined, "clean → undefined (no settings key)");
    assertEqual(app.exportProjectSettings("sample").selCode, app.settingsGet("selCode"), "sample → selCode");
    assertEqual(app.exportProjectSettings("sample").pvText, app.settingsGet("pvText"), "sample → pvText");
    assertEqual(Object.keys(app.exportProjectSettings("sample")).length, 2, "sample → exactly two keys");
    assertEqual(Object.keys(app.exportProjectSettings("full")).length, Object.keys(app.settingsDefaults()).length, "full → every setting");
    assertEqual(app.exportProjectSettings("full").pngBg, app.settingsGet("pngBg"), "full → carries personal settings (not in the sample set)");
    app.setCleanPresentation(true);
    assertEqual(Object.keys(app.exportProjectSettings("clean")).length, 2, "clean-with-toggle → exactly the two");
  } finally {
    app.settingsSet("cleanPresentation", oldToggle);
    bfExpRestore(saved);
  }
});
