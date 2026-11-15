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

// Escape sequences (DECISIONS #49): \* \_ \\
test("markup: \\* and \\_ produce literal * and _ without toggling", function () {
  var r = BF.parseMarkup("a\\*b\\_c"); // a\*b\_c
  assertEqual(r.length, 5, "a * b _ c");
  assertEqual(codes(r)[1], 0x2A, "literal *");
  assertEqual(codes(r)[3], 0x5F, "literal _");
  for (var i = 0; i < r.length; i++) {
    assertEqual(r[i].bold, false, "no bold leak at " + i);
    assertEqual(r[i].italic, false, "no italic leak at " + i);
  }
});

test("markup: \\* inside bold is a literal bold *", function () {
  var r = BF.parseMarkup("*\\**"); // *\**
  assertEqual(r.length, 1);
  assertEqual(codes(r)[0], 0x2A);
  assertEqual(r[0].bold, true, "inherits bold from surrounding markup");
});

test("markup: double backslash is a literal backslash", function () {
  var r = BF.parseMarkup("a\\\\b"); // a\\b
  assertEqual(r.length, 3);
  assertEqual(codes(r)[1], 0x5C);
});

test("markup: double backslash before uXX is literal, not an escape", function () {
  var r = BF.parseMarkup("\\\\u41"); // \\u41
  assertEqual(r.length, 4, "\\ u 4 1");
  assertEqual(codes(r)[0], 0x5C, "backslash");
  assertEqual(codes(r)[1], 117, "u is plain text again");
});

test("markup: trailing backslash is a literal", function () {
  var r = BF.parseMarkup("a\\"); // a\
  assertEqual(r.length, 2);
  assertEqual(codes(r)[1], 0x5C);
});

// Newline break tokens (DECISIONS #63)
test("markup: newline emits a break token, no glyph", function () {
  var r = BF.parseMarkup("A\nB");
  assertEqual(r.length, 3, "two glyphs + one break");
  assert(r[1].nl === true, "middle item is a break");
  assertEqual(r[1].code, -1, "break carries no glyph");
  assert(r[1].ok === true, "break is not an error item");
  assert(r[0].nl !== true && r[2].nl !== true, "glyphs are not breaks");
});

test("markup: bold/italic state spans newlines", function () {
  var r = BF.parseMarkup("*A\nB*");
  assertEqual(r[0].bold, true, "first line bold");
  assertEqual(r[2].bold, true, "second line still bold");
  var r2 = BF.parseMarkup("_x\ny_");
  assertEqual(r2[0].italic, true, "first line italic");
  assertEqual(r2[2].italic, true, "second line still italic");
});

test("markup: consecutive newlines emit one break token each", function () {
  var r = BF.parseMarkup("A\n\nB");
  assertEqual(r.length, 4, "A, break, break, B");
  assert(r[1].nl === true && r[2].nl === true, "both breaks flagged");
  assertEqual(codes(r)[0], 65, "A");
  assertEqual(codes(r)[3], 66, "B");
});
