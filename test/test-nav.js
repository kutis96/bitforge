/* bitforge — tests for BF.navigate (atlas keyboard navigation). */

test("navigate: left/right move by 1 and clamp at the atlas edges", function () {
  assertEqual(BF.navigate(5, "left"), 4);
  assertEqual(BF.navigate(0, "left"), 0, "clamps at 0x00");
  assertEqual(BF.navigate(254, "right"), 255);
  assertEqual(BF.navigate(255, "right"), 255, "clamps at 0xFF");
});

test("navigate: up/down move by one row (16) and clamp", function () {
  assertEqual(BF.navigate(33, "up"), 17);
  assertEqual(BF.navigate(15, "up"), 15, "can't go above row 0");
  assertEqual(BF.navigate(239, "down"), 255);
  assertEqual(BF.navigate(240, "down"), 240, "clamps within the last row");
  assertEqual(BF.navigate(255, "down"), 255);
});

test("navigate: rowStart/rowEnd = col 0 / col 15 of the CURRENT row", function () {
  assertEqual(BF.navigate(33, "rowStart"), 32,  "0x21 -> 0x20");
  assertEqual(BF.navigate(33, "rowEnd"), 47,    "0x21 -> 0x2F");
  assertEqual(BF.navigate(16, "rowStart"), 16,  "row 1 starts at 0x10");
  assertEqual(BF.navigate(16, "rowEnd"), 31,    "row 1 ends at 0x1F");
  assertEqual(BF.navigate(0, "rowStart"), 0);
  assertEqual(BF.navigate(255, "rowEnd"), 255);
});

test("navigate: top/bottom go to 0x00 / 0xFF", function () {
  assertEqual(BF.navigate(100, "top"), 0);
  assertEqual(BF.navigate(100, "bottom"), 255);
});

test("navigate: unknown dir returns the code unchanged", function () {
  assertEqual(BF.navigate(7, "bogus"), 7);
});
