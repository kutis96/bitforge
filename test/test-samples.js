/* bitforge — bundled samples (chunk V, DECISIONS #77).
 * Runs last: it temporarily mutates BF_SAMPLES / localStorage and restores them. */

test("samples: registry is an array and every shipped entry validates", function () {
  var app = globalThis.__stub.app;
  var L = app.sampleList();
  assert(L instanceof Array, "sampleList() returns an array");
  for (var i = 0; i < L.length; i++) {
    var v = app.validateSample(L[i]);
    assert(v.ok, "registry entry " + i + " is a valid .bitforge project (bad samples fail the build): " + (v.ok ? "" : v.error));
  }
});

test("dom: sample picker — empty registry shows the empty state", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var savedLen = BF_SAMPLES.length;
  BF_SAMPLES.length = 0;
  try {
    assertEqual(app.sampleList().length, 0, "no samples");
    assertEqual(app.defaultSample(), null, "no default sample");
    app.openSampleModal();
    assert(els["sample-modal"].hidden === false, "modal shown");
    assert(els["sample-empty"].hidden === false, "empty state visible");
    assertEqual(els["sample-list"].children.length, 0, "no entries rendered");
    app.closeSampleModal();
    assert(els["sample-modal"].hidden === true, "modal hidden again");
  } finally {
    BF_SAMPLES.length = savedLen;
  }
});

test("dom: sample picker — entry renders; loadSample replaces the font", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var f = app.state.font;
  var savedLen = BF_SAMPLES.length;
  try {
    // Sample = snapshot of the (blank) font; then diverge the live font so
    // the replacement is detectable.
    var text = app.projectExportText();
    BF_SAMPLES.push({ id: "t-sample", name: "T-Sample", description: "headless", json: text });
    assertEqual(app.validateSample(BF_SAMPLES[BF_SAMPLES.length - 1]).ok, true, "test sample validates");

    app.openSampleModal();
    assert(els["sample-empty"].hidden === true, "empty state hidden");
    assertEqual(els["sample-list"].children.length, 1, "one entry rendered");
    assert(els["sample-list"].children[0].className === "sample-item", "entry styled");

    BF.setPixel(f, 65, 0, 0, 1); // live font diverges from the snapshot
    app.closeSampleModal();
    globalThis.__stub.setConfirm(true);
    app.loadSample(BF_SAMPLES.length - 1);
    assertEqual(BF.getPixel(app.state.font, 65, 0, 0), 0, "font replaced by the sample (pixel gone)");
    assert(app.getLastToast().indexOf("Loaded sample T-Sample") === 0, "toast: " + app.getLastToast());

    // Cancelled confirm = no-op
    BF.setPixel(app.state.font, 65, 0, 0, 1);
    globalThis.__stub.setConfirm(false);
    app.loadSample(BF_SAMPLES.length - 1);
    assertEqual(BF.getPixel(app.state.font, 65, 0, 0), 1, "cancelled confirm leaves the font alone");
    globalThis.__stub.setConfirm(true);

    // Invalid bundled sample -> error toast, font untouched
    BF_SAMPLES.push({ id: "t-bad", name: "T-Bad", json: "{ not json" });
    BF.setPixel(app.state.font, 65, 0, 0, 1);
    app.loadSample(BF_SAMPLES.length - 1);
    assert(app.getLastToast().indexOf("is invalid") !== -1, "invalid sample toasts an error: " + app.getLastToast());
  } finally {
    BF_SAMPLES.length = savedLen;
    globalThis.__stub.setConfirm(true);
  }
});

test("dom: first-run preload — default sample, saved font wins", function () {
  var app = globalThis.__stub.app;
  var f = app.state.font;
  var savedLen = BF_SAMPLES.length;
  var savedLS = globalThis.localStorage.getItem("bitforge.font.v1");
  try {
    // A sample carrying one ink pixel, flagged default.
    BF.setPixel(f, 66, 0, 0, 1);
    var text = app.projectExportText();
    BF_SAMPLES.push({ id: "t-default", name: "T-Default", json: text, default: true });
    BF.setPixel(f, 66, 0, 0, 0); // live font now differs from the sample

    // First run (no saved font) -> the default sample is used.
    globalThis.localStorage.removeItem("bitforge.font.v1");
    var out = app.loadInitialFont();
    assert(out, "a font is returned");
    assertEqual(BF.getPixel(out, 66, 0, 0), 1, "sample's ink pixel present");
    assert(app.getLastToast().indexOf("Loaded bundled sample T-Default") === 0, "toast: " + app.getLastToast());

    // A saved font always wins over the sample.
    globalThis.localStorage.setItem("bitforge.font.v1", JSON.stringify(BF.fontToBlob(app.state.font)));
    var out2 = app.loadInitialFont();
    assertEqual(BF.getPixel(out2, 66, 0, 0), 0, "saved font wins (sample pixel absent)");

    // Invalid sample -> blank fallback (still a font).
    BF_SAMPLES.length = savedLen;
    BF_SAMPLES.push({ id: "t-bad2", name: "T-Bad2", json: "{ nope", default: true });
    globalThis.localStorage.removeItem("bitforge.font.v1");
    var out3 = app.loadInitialFont();
    assert(out3 && out3.width === 8 && out3.height === 16, "blank 8x16 fallback");
    assert(app.getLastToast().indexOf("starting blank") !== -1, "toast: " + app.getLastToast());

    // No samples at all -> blank, no toast (pre-[V] behavior).
    BF_SAMPLES.length = savedLen;
    var before = app.getLastToast();
    var out4 = app.loadInitialFont();
    assert(out4 && out4.width === 8 && out4.height === 16, "blank 8x16 when no samples");
    assertEqual(app.getLastToast(), before, "no toast without samples");
  } finally {
    BF_SAMPLES.length = savedLen;
    if (savedLS != null) globalThis.localStorage.setItem("bitforge.font.v1", savedLS);
    else globalThis.localStorage.removeItem("bitforge.font.v1");
  }
});
