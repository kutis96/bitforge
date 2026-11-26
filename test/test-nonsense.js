/* bitforge — nonsense text generators (chunk [AD], DECISIONS #90).
 * Pure-generator tests (BF_NS) + Preview insert wiring (needs the stub + app.js,
 * which test/run.js loads first and test-dom.js runs init() for). */

// Deterministic () => [0,1) source so the generators are testable (the app
// passes Math.random; tests pass a seeded LCG).
function lcg(seed) {
  var s = (seed >>> 0) || 1;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
// The point is "displayable in the 8-bit font": only ASCII letters/digits/
// punctuation and line breaks (the code generator emits a multi-line snippet).
var isAscii = function (s) { return typeof s === "string" && s.length > 0 && /^[\x20-\x7e\n]+$/.test(s); };

test("nonsense: prose is deterministic per seed", function () {
  assertEqual(BF_NS.prose(lcg(42)), BF_NS.prose(lcg(42)), "same seed -> same prose");
  assert(BF_NS.prose(lcg(1)) !== BF_NS.prose(lcg(2)), "different seeds -> different prose");
});

test("nonsense: code is deterministic per seed", function () {
  assertEqual(BF_NS.code(lcg(7)), BF_NS.code(lcg(7)), "same seed -> same code");
  assert(BF_NS.code(lcg(1)) !== BF_NS.code(lcg(99)), "different seeds -> different code");
});

test("nonsense: prose — 3-7 sentences, capitalized starts, ASCII, a bracketed aside", function () {
  var p = BF_NS.prose(lcg(1234));
  // Count SENTENCE STARTS, not punctuation: the {PART}! the {N} {V}! template
  // carries an internal interjection "!" that is not a sentence boundary.
  var count = 1 + (p.match(/[.?!] [A-Z]/g) || []).length;
  assert(count >= 3 && count <= 7, "3-7 sentences (got " + count + "): " + p);
  assert(p.charAt(0) === p.charAt(0).toUpperCase() && p.charAt(0) !== p.charAt(0).toLowerCase(),
    "first sentence starts uppercase");
  assert(isAscii(p), "printable ASCII only");
  assert(/[(\[]/.test(p), "has a bracketed/parenthetical aside");
  var re = /[.?!] ([A-Za-z])/g, m, ok = true;
  while ((m = re.exec(p))) { if (m[1] !== m[1].toUpperCase()) ok = false; }
  assert(ok, "every sentence start is capitalized");
});

test("nonsense: code — plausible JS (function/return/for/var), ASCII", function () {
  var c = BF_NS.code(lcg(555));
  assert(/function/.test(c), "has a function");
  assert(/return/.test(c), "has a return");
  assert(/\bfor\b/.test(c), "has a for loop");
  assert(/\bvar\b/.test(c), "has a var");
  assert(isAscii(c), "printable ASCII only");
});

test("nonsense: generators accept no rng (Math.random fallback) without throwing", function () {
  assert(isAscii(BF_NS.prose()), "prose() with no rng works");
  assert(isAscii(BF_NS.code()), "code() with no rng works");
});

test("nonsense: genInsert — empty as-is, append w/ blank line, replace selection", function () {
  var app = globalThis.__stub.app, t = globalThis.__stub.els["pv-text"];
  var saved = t.value;
  try {
    t.value = ""; delete t.selectionStart; delete t.selectionEnd;
    app.genInsert("HELLO");
    assertEqual(t.value, "HELLO", "empty -> inserted as-is");

    t.value = "abc"; delete t.selectionStart; delete t.selectionEnd;
    app.genInsert("WORLD");
    assertEqual(t.value, "abc\n\nWORLD", "append adds one blank line");

    t.value = "abc\n"; delete t.selectionStart; delete t.selectionEnd;
    app.genInsert("WORLD");
    assertEqual(t.value, "abc\n\nWORLD", "append keeps exactly one blank line even when the text already ends in a newline");

    t.value = "abcdef"; t.selectionStart = 2; t.selectionEnd = 4;
    app.genInsert("XY");
    assertEqual(t.value, "abXYef", "selection is replaced (no blank line)");
    assertEqual(app.settingsGet("pvText"), "abXYef", "pvText setting follows the insert");
  } finally {
    t.value = saved;
    delete t.selectionStart; delete t.selectionEnd;
    app.settingsSet("pvText", saved);
    app.drawPvText();
  }
});

test("nonsense: Preview generator buttons insert text and the setting follows", function () {
  var app = globalThis.__stub.app, t = globalThis.__stub.els["pv-text"];
  var saved = t.value;
  try {
    t.value = "";
    globalThis.__stub.dispatch("pv-gen-prose", "click", {});
    assert(t.value.length > 0, "prose button filled the text box");
    assert(/[a-z]/.test(t.value), "prose has lowercase nonsense letters");
    assertEqual(app.settingsGet("pvText"), t.value, "pvText follows the prose insert");

    var before = t.value;
    globalThis.__stub.dispatch("pv-gen-code", "click", {});
    assert(t.value.length > before.length, "code button appended to the text box");
    assert(/function/.test(t.value), "code output contains 'function'");
    assertEqual(app.settingsGet("pvText"), t.value, "pvText follows the code insert");
  } finally {
    t.value = saved;
    app.settingsSet("pvText", saved);
    app.drawPvText();
  }
});
