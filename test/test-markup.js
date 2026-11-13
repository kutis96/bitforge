/* bitforge — unit tests: [3] Preview markup parser */

function codes(runs) {
  var a = [];
  for (var i = 0; i < runs.length; i++) a.push(runs[i].code);
  return a;
}

test("markup: plain text -> one item per char, no flags", function () {
  var r = BF.parseMarkup("AB");
  assertEqual(r.length, 2);
  assertEqual(codes(r)[0], 65);
  assertEqual(codes(r)[1], 66);
  assertEqual(r[0].bold, false);
  assertEqual(r[0].italic, false);
});

test("markup: *bold* wraps only the enclosed chars", function () {
  var r = BF.parseMarkup("a*bc*d");
  assertEqual(r.length, 4);
  assertEqual(r[0].bold, false, "a");
  assertEqual(r[1].bold, true, "b");
  assertEqual(r[2].bold, true, "c");
  assertEqual(r[3].bold, false, "d");
});

test("markup: _italic_ wraps only the enclosed chars", function () {
  var r = BF.parseMarkup("x_yz_");
  assertEqual(r.length, 3, "x, y, z (the _ markers are not glyphs)");
  assertEqual(r[0].italic, false, "x");
  assertEqual(r[1].italic, true, "y");
  assertEqual(r[2].italic, true, "z");
});

test("markup: nesting *_.._* yields both bold and italic", function () {
  var r = BF.parseMarkup("*_a_*");
  assertEqual(r.length, 1);
  assertEqual(r[0].code, 97);
  assertEqual(r[0].bold, true);
  assertEqual(r[0].italic, true);
});

test("markup: \\uXX escape maps to codepoint and inherits flags", function () {
  var r = BF.parseMarkup("\\u41*\\u42*\\u00");
  assertEqual(r.length, 3);
  assertEqual(codes(r)[0], 65);
  assertEqual(codes(r)[1], 66);
  assertEqual(r[1].bold, true, "B is bold");
  assertEqual(codes(r)[2], 0, "NUL via \\u00");
});

test("markup: BMP char > 255 is undisplayable", function () {
  var r = BF.parseMarkup("€"); // euro sign, U+20AC
  assertEqual(r.length, 1);
  assertEqual(r[0].ok, false);
});

test("markup: surrogate pair (emoji) is a single undisplayable item", function () {
  var r = BF.parseMarkup("😀"); // grinning face, U+1F600
  assertEqual(r.length, 1);
  assertEqual(r[0].ok, false);
});

test("markup: high-ASCII (<=255) is displayable with its code", function () {
  var r = BF.parseMarkup("é"); // é, U+00E9 = 233
  assertEqual(r.length, 1);
  assertEqual(r[0].ok, true);
  assertEqual(r[0].code, 233);
});

test("markup: lone backslash (no uXX) is a literal", function () {
  var r = BF.parseMarkup("a\\b"); // a \ b
  assertEqual(r.length, 3);
  assertEqual(codes(r)[1], 92, "backslash kept as literal");
});

test("markup: empty input -> no items", function () {
  assertEqual(BF.parseMarkup("").length, 0);
});
