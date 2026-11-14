/* bitforge — tests for QA checks (BF.findDuplicates, BF.inkCount). */

test("inkCount: counts set pixels, zero for empty/bad code", function () {
  var f = BF.makeFont(8, 16);
  BF.setPixel(f, 4, 0, 0, 1);
  BF.setPixel(f, 4, 7, 15, 1);
  assertEqual(BF.inkCount(f, 4), 2);
  assertEqual(BF.inkCount(f, 5), 0);
  assertEqual(BF.inkCount(f, -1), 0);
  assertEqual(BF.inkCount(f, 256), 0);
});

test("findDuplicates: blank font => no groups (all-empty excluded)", function () {
  var f = BF.makeFont(4, 4);
  assertEqual(BF.findDuplicates(f).length, 0, "the all-empty group is not reported");
});

test("findDuplicates: two identical non-empty glyphs => one group", function () {
  var f = BF.makeFont(4, 4);
  BF.setPixel(f, 5, 1, 1, 1);
  BF.setPixel(f, 9, 1, 1, 1);
  var d = BF.findDuplicates(f);
  assertEqual(d.length, 1);
  assertEqual(d[0].codes.length, 2);
  assertEqual(d[0].codes[0], 5);
  assertEqual(d[0].codes[1], 9);
  assertEqual(d[0].ink, 1);
});

test("findDuplicates: distinct glyphs => no groups", function () {
  var f = BF.makeFont(4, 4);
  BF.setPixel(f, 5, 0, 0, 1);
  BF.setPixel(f, 9, 1, 1, 1);
  assertEqual(BF.findDuplicates(f).length, 0);
});

test("findDuplicates: three identical glyphs group together, others don't", function () {
  var f = BF.makeFont(4, 4);
  var codes = [10, 20, 30], i;
  for (i = 0; i < 3; i++) BF.setPixel(f, codes[i], 2, 2, 1);
  BF.setPixel(f, 40, 0, 3, 1); // unique
  var d = BF.findDuplicates(f);
  assertEqual(d.length, 1);
  assertEqual(d[0].codes.join(","), "10,20,30");
  assertEqual(d[0].ink, 1);
});

test("findDuplicates: identical glyphs with different ink counts are separate", function () {
  var f = BF.makeFont(4, 4);
  BF.setPixel(f, 5, 1, 1, 1);
  BF.setPixel(f, 6, 1, 1, 1);
  BF.setPixel(f, 6, 2, 2, 1); // 6 now differs from 5
  var d = BF.findDuplicates(f);
  assertEqual(d.length, 0);
});
