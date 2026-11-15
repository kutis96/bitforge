/* bitforge — edge-ink QA (BF.edgeInk, DECISIONS #46) */

test("edge: blank glyph touches no edges", function () {
  var f = BF.makeFont(8, 16);
  assertEqual(BF.edgeInk(f, 0).length, 0, "no ink, no edges");
});

test("edge: single corner pixels name the two edges they sit on", function () {
  var f = BF.makeFont(8, 16);
  BF.setPixel(f, 5, 0, 0, 1);
  assertEqual(BF.edgeInk(f, 5).join(","), "top,left", "corner (0,0) = top + left");
  BF.setPixel(f, 5, 0, 0, 0);
  BF.setPixel(f, 5, 7, 15, 1);
  assertEqual(BF.edgeInk(f, 5).join(","), "bottom,right", "corner (7,15) = bottom + right");
});

test("edge: interior ink is clean; edge ink names exactly the touched edges", function () {
  var f = BF.makeFont(8, 16);
  BF.setPixel(f, 1, 3, 7, 1);
  assertEqual(BF.edgeInk(f, 1).length, 0, "interior pixel touches nothing");
  BF.setPixel(f, 1, 3, 0, 1);
  BF.setPixel(f, 1, 3, 15, 1);
  assertEqual(BF.edgeInk(f, 1).join(","), "top,bottom", "top + bottom rows");
  BF.setPixel(f, 1, 0, 7, 1);
  BF.setPixel(f, 1, 7, 7, 1);
  assertEqual(BF.edgeInk(f, 1).join(","), "top,bottom,left,right", "all four edges");
});

test("edge: degenerate 1px-wide font — one ink pixel touches left+right too", function () {
  var f = BF.makeFont(1, 2);
  BF.setPixel(f, 2, 0, 1, 1);
  assertEqual(BF.edgeInk(f, 2).join(","), "bottom,left,right", "single column = left + right + bottom");
});

test("edge: out-of-range code returns no edges", function () {
  var f = BF.makeFont(8, 16);
  assertEqual(BF.edgeInk(f, -1).length, 0, "-1");
  assertEqual(BF.edgeInk(f, 256).length, 0, "256");
});
