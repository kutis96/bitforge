/* bitforge — sample fonts (chunk V.1, DECISIONS #78, supersedes #77's embedded registry).
 * Runs last: the async tests temporarily install a fake global fetch/location and
 * restore them (plus localStorage + the confirm stub) in every settle path. */

function bfFakeFetch(routes) {
  // routes: { "samples/manifest.json": { json: [...] }, "samples/x.bitforge": { text: "…" } }
  return function (url) {
    var r = routes[url];
    if (!r) return Promise.reject(new Error("404 " + url));
    return Promise.resolve({
      ok: true, status: 200,
      json: function () { return Promise.resolve(r.json); },
      text: function () { return Promise.resolve(r.text); }
    });
  };
}

function bfRestoreEnv(oldLoc, oldFetch, savedLS) {
  if (oldLoc === undefined) delete globalThis.location; else globalThis.location = oldLoc;
  if (oldFetch === undefined) delete globalThis.fetch; else globalThis.fetch = oldFetch;
  if (savedLS != null) globalThis.localStorage.setItem("bitforge.font.v1", savedLS);
  else globalThis.localStorage.removeItem("bitforge.font.v1");
  globalThis.__stub.setConfirm(true);
}

// A valid .bitforge project text carrying one marker pixel the live font does NOT have.
function bfSampleWithMarker() {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  BF.setPixel(f, 65, 3, 4, 1);            // pure core mutation — no app side effects
  var text = app.projectExportText();
  BF.setPixel(f, 65, 3, 4, 0);
  return text;
}

test("samples: file:// — not served ⇒ picker hidden, no samples, blank start", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  delete globalThis.location; delete globalThis.fetch;
  assertEqual(app.isServed(), false, "not served under the stub");
  app.setSamples([], "idle");
  return app.fetchSamples().then(function (L) {
    assertEqual(L.length, 0, "no samples loaded");
    assertEqual(app.samplesState(), "unavailable", "state = unavailable");
    assertEqual(els["mi-load-sample"].hidden, true, "menu item hidden");
    app.openSampleModal();
    assertEqual(els["sample-empty"].hidden, false, "empty state visible");
    assertEqual(els["sample-list"].children.length, 0, "no entries rendered");
    app.closeSampleModal();
    assertEqual(els["sample-modal"].hidden, true, "modal hidden again");
  }, function (e) { throw e; });
});

test("samples: buildSamples — validates, skips bad entries, keeps the good ones (pure)", function () {
  var app = globalThis.__stub.app;
  var good = app.projectExportText();
  var manifest = [
    { id: "good", name: "Good", file: "good.bitforge", default: true },
    { id: "no-file", name: "NoFile" },                      // no file  -> skipped
    { id: "bad-json", name: "BadJson", file: "bad.json" },  // unparseable -> skipped
    { id: "missing", name: "Missing", file: "missing.bitforge" } // textFor throws -> skipped
  ];
  var texts = { "good.bitforge": good };
  function textFor(file) {
    if (file === "missing.bitforge") throw new Error("not found");
    if (!(file in texts)) throw new Error("no such file");
    return texts[file];
  }
  var L = app.buildSamples(manifest, textFor);
  assertEqual(L.length, 1, "only the good entry survives");
  assertEqual(L[0].id, "good", "good entry kept");
  assertEqual(L[0].name, "Good", "name carried");
  assertEqual(L[0].default, true, "default carried");
  assert(L[0].font && L[0].font.width === 8 && L[0].font.height === 16, "font built from the sample");

  var threw = false;
  try { app.buildSamples("not an array", textFor); } catch (e) { threw = true; }
  assert(threw, "non-array manifest throws");

  assertEqual(app.validateSampleText({ name: "X" }, good).ok, true, "valid text -> ok");
  assertEqual(app.validateSampleText({ name: "X" }, "{ nope").ok, false, "unparseable -> not ok");
  assertEqual(app.validateSampleText({ name: "X" }, undefined).ok, false, "missing text -> not ok");
});

test("samples: served — fetch manifest + file, validate, render, load (async)", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var savedLS = globalThis.localStorage.getItem("bitforge.font.v1");
  globalThis.localStorage.removeItem("bitforge.font.v1");
  var oldLoc = globalThis.location, oldFetch = globalThis.fetch;
  var text = bfSampleWithMarker();

  globalThis.location = { protocol: "http:" };
  globalThis.fetch = bfFakeFetch({
    "samples/manifest.json": { json: [ { id: "t", name: "T-Sample", description: "desc", file: "t.bitforge", default: true } ] },
    "samples/t.bitforge": { text: text }
  });
  app.setSamples([], "idle"); // force a real fetch

  function ok(L) {
    assertEqual(L.length, 1, "one sample loaded");
    assertEqual(L[0].name, "T-Sample", "name from the manifest");
    assertEqual(L[0].default, true, "default flag carried");
    assertEqual(BF.getPixel(L[0].font, 65, 3, 4), 1, "sample font carries the marker pixel");
    assertEqual(app.samplesState(), "ready", "state = ready");
    assertEqual(els["mi-load-sample"].hidden, false, "menu item visible");

    app.openSampleModal();
    assertEqual(els["sample-empty"].hidden, true, "empty state hidden");
    assertEqual(els["sample-list"].children.length, 1, "one row rendered");
    assertEqual(els["sample-list"].children[0].className, "sample-item", "row styled");
    app.closeSampleModal();

    globalThis.__stub.setConfirm(true);
    app.loadSample(0);
    assertEqual(BF.getPixel(app.state.font, 65, 3, 4), 1, "loadSample replaced the font");
    assert(app.getLastToast().indexOf("Loaded sample T-Sample") === 0, "toast: " + app.getLastToast());

    // Cancelled confirm = no-op
    BF.setPixel(app.state.font, 65, 3, 4, 0);
    globalThis.__stub.setConfirm(false);
    app.loadSample(0);
    assertEqual(BF.getPixel(app.state.font, 65, 3, 4), 0, "cancelled confirm leaves the font alone");
  }
  return app.fetchSamples().then(ok, function (e) { bfRestoreEnv(oldLoc, oldFetch, savedLS); throw e; })
    .then(function () { bfRestoreEnv(oldLoc, oldFetch, savedLS); });
});

test("samples: served — a broken entry is skipped, good ones survive (async)", function () {
  var app = globalThis.__stub.app;
  var oldLoc = globalThis.location, oldFetch = globalThis.fetch;
  var goodText = bfSampleWithMarker();

  globalThis.location = { protocol: "https:" };
  globalThis.fetch = bfFakeFetch({
    "samples/manifest.json": { json: [
      { id: "good", name: "Good", file: "good.bitforge" },
      { id: "bad", name: "Bad", file: "bad.bitforge" } // served but unparseable
    ] },
    "samples/good.bitforge": { text: goodText },
    "samples/bad.bitforge": { text: "{ definitely not json" }
  });
  app.setSamples([], "idle");
  function ok(L) {
    assertEqual(L.length, 1, "only the good sample survives");
    assertEqual(L[0].id, "good", "good one kept");
    assertEqual(app.samplesState(), "ready", "still ready");
  }
  return app.fetchSamples().then(ok, function (e) { bfRestoreEnv(oldLoc, oldFetch, null); throw e; })
    .then(function () { bfRestoreEnv(oldLoc, oldFetch, null); });
});

test("samples: first-run preload (served) applies the default sample (async)", function () {
  var app = globalThis.__stub.app;
  var savedLS = globalThis.localStorage.getItem("bitforge.font.v1");
  var oldLoc = globalThis.location, oldFetch = globalThis.fetch;
  var f = app.state.font;
  BF.setPixel(f, 66, 5, 6, 1);
  var text = app.projectExportText();
  BF.setPixel(f, 66, 5, 6, 0);

  globalThis.location = { protocol: "http:" };
  globalThis.fetch = bfFakeFetch({
    "samples/manifest.json": { json: [ { id: "d", name: "D-Default", file: "d.bitforge", default: true } ] },
    "samples/d.bitforge": { text: text }
  });
  app.setSamples([], "idle");
  function ok() {
    assertEqual(BF.getPixel(app.state.font, 66, 5, 6), 1, "default sample preloaded (marker present)");
    assert(app.getLastToast().indexOf("Loaded sample D-Default (first run)") === 0, "toast: " + app.getLastToast());
  }
  return app.firstRunSamplePreload().then(ok, function (e) { bfRestoreEnv(oldLoc, oldFetch, savedLS); throw e; })
    .then(function () { bfRestoreEnv(oldLoc, oldFetch, savedLS); });
});
