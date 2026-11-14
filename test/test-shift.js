/* bitforge — tests for BF.shiftGlyph (keyboard glyph shift). */

test("shiftGlyph: moves ink by (dx, dy)", function () {
  var f = BF.makeFont(8, 4);
  BF.setPixel(f, 3, 0, 0, 1);
  var res = BF.shiftGlyph(f, 3, 1, 1);
  assertEqual(res.changed, true);
  assertEqual(res.clipped, 0);
  assertEqual(BF.getPixel(f, 3, 0, 0), 0, "old spot cleared");
  assertEqual(BF.getPixel(f, 3, 1, 1), 1, "ink moved to (1,1)");
});

test("shiftGlyph: drops out-of-bounds ink and counts it", function () {
  var f = BF.makeFont(8, 4);
  BF.setPixel(f, 5, 7, 3, 1); // bottom-right corner
  var res = BF.shiftGlyph(f, 5, 1, 1);
  assertEqual(res.clipped, 1, "one pixel clipped");
  assertEqual(res.changed, true);
  for (var y = 0; y < 4; y++)
    for (var x = 0; x < 8; x++)
      assertEqual(BF.getPixel(f, 5, x, y), 0, "glyph fully empty after clip");
});

test("shiftGlyph: large shift clips everything", function () {
  var f = BF.makeFont(8, 4);
  BF.setPixel(f, 3, 2, 2, 1);
  BF.setPixel(f, 3, 3, 2, 1);
  var res = BF.shiftGlyph(f, 3, 100, 0);
  assertEqual(res.clipped, 2, "both pixels clipped");
  assertEqual(BF.getPixel(f, 3, 2, 2), 0);
});

test("shiftGlyph: zero shift is a no-op (changed=false, clipped=0)", function () {
  var f = BF.makeFont(8, 4);
  BF.setPixel(f, 7, 2, 2, 1);
  var res = BF.shiftGlyph(f, 7, 0, 0);
  assertEqual(res.changed, false);
  assertEqual(res.clipped, 0);
  assertEqual(BF.getPixel(f, 7, 2, 2), 1);
});

test("shiftGlyph: empty glyph stays unchanged", function () {
  var f = BF.makeFont(8, 4);
  var res = BF.shiftGlyph(f, 9, 1, 0);
  assertEqual(res.changed, false);
  assertEqual(res.clipped, 0);
});

test("shiftGlyph: only touches the target glyph", function () {
  var f = BF.makeFont(8, 4);
  BF.setPixel(f, 3, 0, 0, 1);
  BF.setPixel(f, 4, 7, 3, 1);
  BF.shiftGlyph(f, 3, 2, 0);
  assertEqual(BF.getPixel(f, 4, 7, 3), 1, "neighbour untouched");
  assertEqual(BF.getPixel(f, 3, 2, 0), 1);
});

test("shiftGlyph: throws on a bad code", function () {
  var f = BF.makeFont(8, 4);
  assertThrows(function () { BF.shiftGlyph(f, 256, 1, 0); });
  assertThrows(function () { BF.shiftGlyph(f, -1, 1, 0); });
});
