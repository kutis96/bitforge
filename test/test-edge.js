/* bitforge — edge-ink QA (BF.edgeInk, DECISIONS #46) + ignore list (DECISIONS #83) */

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

// ---------- [AA] ignore list (DECISIONS #83) ----------

test("checkprops: a fresh font ignores no edges (default behavior unchanged)", function () {
  var f = BF.makeFont(8, 16);
  assert(f.checkProps !== undefined, "makeFont initializes checkProps");
  assertEqual(Object.keys(f.checkProps).length, 0, "no properties by default");
  BF.setPixel(f, 5, 0, 0, 1);
  assertEqual(BF.activeEdges(f, 5).join(","), "top,left", "default: everything is reported");
});

test("checkprops: ignored edges are dropped from activeEdges", function () {
  var f = BF.makeFont(8, 16);
  BF.setPixel(f, 1, 0, 0, 1);   // top + left
  BF.setPixel(f, 1, 7, 15, 1);  // bottom + right
  f.checkProps.edge = { ignoreEdges: ["top", "left"] };
  assertEqual(BF.activeEdges(f, 1).join(","), "bottom,right", "ignored edges dropped");
  assertEqual(BF.edgeInk(f, 1).length, 4, "edgeInk stays raw geometry");
});

test("checkprops: a glyph touching only ignored edges is clean", function () {
  var f = BF.makeFont(8, 16);
  BF.setPixel(f, 2, 3, 0, 1); // top only (x=3 is interior, y=0 is the top row)
  f.checkProps.edge = { ignoreEdges: ["top"] };
  assertEqual(BF.activeEdges(f, 2).length, 0, "top-only glyph clean when top is ignored");
  f.checkProps.edge = { ignoreEdges: ["left"] };
  assertEqual(BF.activeEdges(f, 2).join(","), "top", "…and still reported when a different edge is ignored");
});

test("checkprops: ignoreEdges is normalized (bad names dropped, deduped)", function () {
  var f = BF.makeFont(8, 16);
  f.checkProps.edge = { ignoreEdges: ["bogus", "top", "top", "left", 42] };
  assertEqual(BF.ignoreEdges(f).join(","), "top,left", "normalized");
  f.checkProps.edge = { ignoreEdges: "top" };
  assertEqual(BF.ignoreEdges(f).length, 0, "non-array -> []");
  delete f.checkProps.edge;
  assertEqual(BF.ignoreEdges(f).length, 0, "absent -> []");
});

test("checkprops: out-of-range code has no active edges", function () {
  var f = BF.makeFont(8, 16);
  f.checkProps.edge = { ignoreEdges: ["top"] };
  assertEqual(BF.activeEdges(f, -1).length, 0, "-1");
  assertEqual(BF.activeEdges(f, 256).length, 0, "256");
});
