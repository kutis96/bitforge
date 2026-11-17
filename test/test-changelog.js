/* bitforge — tests for version compare + changelog filtering (DECISIONS #73).
 * Also sanity-checks the real BF_CHANGELOG data (loaded in run.js). */

test("versions: cmpVersions compares semver-ish triples", function () {
  assertEqual(BF.cmpVersions("0.18.0", "0.18.0"), 0, "equal");
  assertEqual(BF.cmpVersions("0.18.0", "0.17.1"), 1, "newer minor");
  assertEqual(BF.cmpVersions("0.17.1", "0.17.0"), 1, "newer patch");
  assertEqual(BF.cmpVersions("0.9.0", "0.18.0"), -1, "numeric, not string, compare");
  assertEqual(BF.cmpVersions("1.0.0", "0.99.99"), 1, "major wins");
  assertEqual(BF.cmpVersions("garbage", "0.0.0"), 0, "invalid => 0.0.0");
  assertEqual(BF.cmpVersions("0.18", "0.18.0"), 0, "missing component => 0");
});

test("versions: changelogSince filters to the entries the user hasn't seen", function () {
  var cl = [
    { version: "0.4.0", changes: ["a"] },
    { version: "0.3.1", changes: ["b"] },
    { version: "0.3.0", changes: ["c"] },
    { version: "0.2.0", changes: ["d"] }
  ];
  assertEqual(BF.changelogSince(cl, null).length, 4, "no last version => all");
  assertEqual(BF.changelogSince(cl, "").length, 4, "empty last version => all");
  assertEqual(BF.changelogSince(cl, "nonsense").length, 4, "invalid last version => all");
  var seen = BF.changelogSince(cl, "0.3.0");
  assertEqual(seen.length, 2, "only entries newer than 0.3.0");
  assertEqual(seen[0].version, "0.4.0", "changelog order kept (newest first)");
  assertEqual(seen[1].version, "0.3.1", "0.3.1 included, 0.3.0 not");
  assertEqual(BF.changelogSince(cl, "0.4.0").length, 0, "last version = newest => none");
  assertEqual(BF.changelogSince(cl, "9.9.9").length, 0, "downgrade => none");
});

test("changelog data: sane format, strictly descending, matches BF.VERSION", function () {
  var cl = globalThis.BF_CHANGELOG, i, e;
  assert(cl && cl.length > 0, "BF_CHANGELOG loaded");
  assertEqual(cl[0].version, BF.VERSION, "newest entry is the current version");
  for (i = 0; i < cl.length; i++) {
    e = cl[i];
    assert(/^\d+\.\d+\.\d+$/.test(e.version), "version format: " + e.version);
    assert(e.changes && e.changes.length > 0, "entry has changes: " + e.version);
    if (i > 0)
      assertEqual(BF.cmpVersions(e.version, cl[i - 1].version), -1, "strictly descending at " + e.version);
  }
});
