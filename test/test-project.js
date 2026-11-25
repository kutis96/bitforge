/* bitforge — project file (.bitforge) tests (DECISIONS #64). */

var CHECK_IDS = ["duplicates", "leftto", "edge", "guides"]; // mirrors app.js qaChecks

test("project: fontToBlob/fontFromBlob roundtrip keeps everything", function () {
  var f = BF.makeFont(6, 4);
  BF.setPixel(f, 0x41, 1, 2, 1);
  BF.setPixel(f, 0x20, 0, 0, 1);
  f.guidelines.push({ o: "h", off: 3, label: "base", color: "#333333" });
  f.guidelines.push({ o: "v", off: 5, label: "R", color: "#444444" });
  f.status[0x41] = 2;
  f.status[0x20] = 1;
  f.silences["edge"] = { 3: true, 255: true };
  var g = BF.fontFromBlob(BF.fontToBlob(f), CHECK_IDS);
  assertEqual(g.width, 6);
  assertEqual(g.height, 4);
  assertEqual(BF.getPixel(g, 0x41, 1, 2), 1, "ink pixel survived");
  assertEqual(BF.getPixel(g, 0x20, 0, 0), 1, "second ink pixel survived");
  assertEqual(g.guidelines.length, 2, "guidelines survived");
  assertEqual(g.guidelines[0].label, "base", "guideline label survived");
  assertEqual(g.status[0x41], 2, "status done survived");
  assertEqual(g.status[0x20], 1, "status wip survived");
  assert(g.silences["edge"][3] && g.silences["edge"][255], "silences survived");
});

test("project: fontFromBlob sanitizes bad data", function () {
  assertEqual(BF.fontFromBlob(null, CHECK_IDS), null, "null blob");
  assertEqual(BF.fontFromBlob("nope", CHECK_IDS), null, "non-object");
  assertEqual(BF.fontFromBlob({ w: 6, h: 0 }, CHECK_IDS), null, "bad dims -> null");
  var s = new Array(256);
  for (var i = 0; i < 256; i++) s[i] = 0;
  s[7] = 2;
  s[8] = 99; // invalid status value
  var f = BF.fontFromBlob({
    w: 6, h: 4, s: s,
    g: [{ o: "h", off: 3, label: "base" }, { o: "diagonal", off: 1 }],
    si: { edge: { 3: true }, bogus: { 1: true } }
  }, CHECK_IDS);
  assert(f, "valid dims survive");
  assertEqual(f.status[7], 2, "valid status kept");
  assertEqual(f.status[8], 0, "invalid status coerced to unfinished");
  assertEqual(f.guidelines.length, 1, "malformed guideline dropped");
  assert(f.silences["edge"][3], "known check silence kept");
  assert(!f.silences["bogus"], "unknown check id dropped");
});

test("project: fontFromBlob clamps guide offsets into [0, dim] [AB]", function () {
  var f = BF.fontFromBlob({
    w: 6, h: 4,
    g: [
      { o: "h", off: 4, label: "desc" },    // bottom edge — valid, kept
      { o: "h", off: 9, label: "waypast" }, // clamps to height
      { o: "h", off: -2, label: "neg" },    // clamps to 0
      { o: "v", off: 6, label: "R" },       // right edge — valid, kept
      { o: "v", off: 42, label: "far" }     // clamps to width
    ]
  }, CHECK_IDS);
  assertEqual(f.guidelines.length, 5, "integer guides are clamped, not dropped");
  assertEqual(f.guidelines[0].off, 4, "h off = height kept");
  assertEqual(f.guidelines[1].off, 4, "h off 9 clamped to height");
  assertEqual(f.guidelines[2].off, 0, "h off -2 clamped to 0");
  assertEqual(f.guidelines[3].off, 6, "v off = width kept");
  assertEqual(f.guidelines[4].off, 6, "v off 42 clamped to width");
});

test("project: fontFromBlob drops silences when no known-check list given", function () {
  var f = BF.fontFromBlob({ w: 6, h: 4, si: { edge: { 3: true } } }, null);
  assert(f, "font still built");
  assertEqual(f.silences["edge"], undefined, "silences dropped without a check list");
});

test("project: fontToBlob/fontFromBlob roundtrips checkProps (DECISIONS #83)", function () {
  var f = BF.makeFont(6, 4);
  f.checkProps.edge = { ignoreEdges: ["top", "left"] };
  var b = BF.fontToBlob(f);
  assert(b.cp && b.cp.edge, "blob carries the cp field");
  var g = BF.fontFromBlob(b, CHECK_IDS);
  assertEqual(g.checkProps.edge.ignoreEdges.join(","), "top,left", "ignore list survived");
});

test("project: fontFromBlob sanitizes checkProps (DECISIONS #83)", function () {
  var f = BF.fontFromBlob({ w: 8, h: 16, cp: { edge: { ignoreEdges: ["top", "bogus", "top"] } } }, CHECK_IDS);
  assertEqual(f.checkProps.edge.ignoreEdges.join(","), "top", "bad names dropped, deduped");
  var g = BF.fontFromBlob({ w: 8, h: 16, cp: { edge: { ignoreEdges: "top" } } }, CHECK_IDS);
  assertEqual(g.checkProps.edge, undefined, "non-array dropped");
  var h = BF.fontFromBlob({ w: 8, h: 16, cp: { bogus: { whatever: 1 }, edge: { ignoreEdges: ["left"] } } }, CHECK_IDS);
  assertEqual(h.checkProps.bogus, undefined, "unknown check id dropped");
  assertEqual(h.checkProps.edge.ignoreEdges.join(","), "left", "known id kept");
  var i = BF.fontFromBlob({ w: 8, h: 16, cp: "junk" }, CHECK_IDS);
  assertEqual(Object.keys(i.checkProps).length, 0, "non-object cp -> {} default");
  var j = BF.fontFromBlob({ w: 8, h: 16 }, CHECK_IDS);
  assertEqual(Object.keys(j.checkProps).length, 0, "older blob (no cp) -> {} default");
});

test("project: projectToObj writes the header + font blob + settings", function () {
  var f = BF.makeFont(8, 16);
  var o = BF.projectToObj(f, { pvScale: 4, pvText: "hi" });
  assertEqual(o.app, "bitforge");
  assertEqual(o.kind, "font-project");
  assertEqual(o.version, 1);
  assertEqual(o.font.w, 8);
  assertEqual(o.font.h, 16);
  assertEqual(o.font.d.length, 256 * 16 * 8, "full glyph data in the blob");
  assertEqual(o.settings.pvScale, 4, "settings pass-through");
  var o2 = BF.projectToObj(f, null);
  assert(!("settings" in o2), "no settings key when none given");
});

test("project: objFromProject roundtrips a JSON-serialized project", function () {
  var f = BF.makeFont(6, 4);
  BF.setPixel(f, 0x41, 1, 2, 1);
  f.status[0x41] = 2;
  f.silences["edge"] = { 3: true };
  var o = BF.projectToObj(f, { pvScale: 4 });
  var p = BF.objFromProject(JSON.parse(JSON.stringify(o)), CHECK_IDS);
  assert(p.ok, "parses back" + (p.ok ? "" : ": " + p.error));
  assertEqual(p.font.width, 6);
  assertEqual(p.font.height, 4);
  assertEqual(BF.getPixel(p.font, 0x41, 1, 2), 1, "ink survived the roundtrip");
  assertEqual(p.font.status[0x41], 2, "status survived");
  assert(p.font.silences["edge"][3], "silence survived");
  assertEqual(p.settings.pvScale, 4, "settings survived");
});

test("project: objFromProject rejects foreign/malformed files with a reason", function () {
  var r1 = BF.objFromProject("nope", CHECK_IDS);
  assertEqual(r1.ok, false, "non-object rejected");
  var r2 = BF.objFromProject({ app: "other", kind: "font-project", version: 1, font: {} }, CHECK_IDS);
  assertEqual(r2.ok, false, "wrong app rejected");
  assert(r2.error.indexOf("not a bitforge") !== -1, "error names the problem: " + r2.error);
  var r3 = BF.objFromProject({ app: "bitforge", kind: "font-project", version: 2, font: { w: 8, h: 16 } }, CHECK_IDS);
  assertEqual(r3.ok, false, "newer version rejected");
  assert(r3.error.indexOf("version") !== -1, "error mentions version: " + r3.error);
  var r4 = BF.objFromProject({ app: "bitforge", kind: "font-project", version: 1 }, CHECK_IDS);
  assertEqual(r4.ok, false, "missing font rejected");
});

test("project: objFromProject treats missing settings as optional", function () {
  var f = BF.makeFont(8, 16);
  var p = BF.objFromProject(BF.projectToObj(f, null), CHECK_IDS);
  assert(p.ok, "parses");
  assertEqual(p.settings, null, "no settings -> null (caller keeps current)");
});

// ---------- font name (DECISIONS #70) ----------

test("name: sanitizeFontName keeps printable ASCII, trims, caps at 64", function () {
  assertEqual(BF.sanitizeFontName("My Font"), "My Font");
  assertEqual(BF.sanitizeFontName("  padded  "), "padded", "trimmed");
  assertEqual(BF.sanitizeFontName("a\nb\tc"), "abc", "control chars dropped");
  assertEqual(BF.sanitizeFontName("h\u00e9llo"), "hllo", "non-ASCII dropped (single precomposed char)");
  assertEqual(BF.sanitizeFontName("x".repeat(100)).length, 64, "capped at 64");
  assertEqual(BF.sanitizeFontName(123), "", "non-string -> empty");
  assertEqual(BF.sanitizeFontName(""), "", "empty stays empty");
});

test("name: filenameBase falls back to \"font\"", function () {
  assertEqual(BF.filenameBase("My Font"), "My Font");
  assertEqual(BF.filenameBase(""), "font", "empty -> font");
  assertEqual(BF.filenameBase("   "), "font", "blank -> font");
  assertEqual(BF.filenameBase(null), "font", "null -> font");
});

test("name: blob roundtrip carries the name; missing/invalid -> default", function () {
  var f = BF.makeFont(8, 16);
  f.name = "Round Trip";
  var b = BF.fontToBlob(f);
  assertEqual(b.n, "Round Trip", "blob carries n");
  assertEqual(BF.fontFromBlob(b, CHECK_IDS).name, "Round Trip", "restored");
  delete b.n;
  assertEqual(BF.fontFromBlob(b, CHECK_IDS).name, "font", "missing n -> default");
  b.n = 42;
  assertEqual(BF.fontFromBlob(b, CHECK_IDS).name, "font", "invalid n -> default");
});
