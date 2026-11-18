/* Core tests — chunk [T] selection rect ops (DECISIONS #75). */

test("core: normRect — normalize, clamp, degenerate => null", function () {
  function same(a, b, msg) {
    assert(a && b, msg + " (both non-null)");
    assertEqual(a.x, b.x, msg + ".x"); assertEqual(a.y, b.y, msg + ".y");
    assertEqual(a.w, b.w, msg + ".w"); assertEqual(a.h, b.h, msg + ".h");
  }
  // Normal, either corner order.
  same(BF.normRect(1, 2, 4, 6, 8, 16), { x: 1, y: 2, w: 4, h: 5 }, "tl-br order");
  same(BF.normRect(4, 6, 1, 2, 8, 16), { x: 1, y: 2, w: 4, h: 5 }, "br-tl order");
  // Clamped to the cell.
  same(BF.normRect(-2, -2, 3, 20, 8, 16), { x: 0, y: 0, w: 4, h: 16 }, "clamped inside");
  same(BF.normRect(5, 5, 40, 40, 8, 16), { x: 5, y: 5, w: 3, h: 11 }, "clamped outside");
  // A single point is a legitimate 1x1 selection (click-vs-drag is
  // disambiguated by the app's moved flag, not by normRect).
  same(BF.normRect(3, 3, 3, 3, 8, 16), { x: 3, y: 3, w: 1, h: 1 }, "point => 1x1");
  same(BF.normRect(10, 1, 5, 1, 8, 16), { x: 5, y: 1, w: 3, h: 1 }, "single row");
});

test("core: rectFill / rectInvert — exact regions, neighbours untouched", function () {
  var f = BF.makeFont(8, 16);
  var c = 0x41, r = { x: 2, y: 3, w: 3, h: 2 };
  BF.setPixel(f, c, 0, 0, 1);          // outside the rect — must survive
  BF.setPixel(f, c, 1, 1, 1);          // outside the rect — must survive
  BF.setPixel(f, c, 2, 3, 1);          // inside the rect — will be toggled

  BF.rectFill(f, c, r, 1);
  for (var y = 0; y < r.h; y++) for (var x = 0; x < r.w; x++)
    assertEqual(BF.getPixel(f, c, r.x + x, r.y + y), 1, "fill: rect all ink");
  assertEqual(BF.getPixel(f, c, 0, 0), 1, "fill: outside ink survives");
  assertEqual(BF.getPixel(f, c, 1, 1), 1, "fill: outside ink survives (2)");
  assertEqual(BF.getPixel(f, c, 5, 4), 0, "fill: outside rect untouched");

  BF.rectInvert(f, c, r);
  assertEqual(BF.getPixel(f, c, 2, 3), 0, "invert: inside cleared");
  assertEqual(BF.getPixel(f, c, r.x + 2, r.y + 1), 0, "invert: whole rect cleared (was all 1)");
  assertEqual(BF.getPixel(f, c, 0, 0), 1, "invert: outside ink survives");

  BF.rectInvert(f, c, r); // invert twice = identity
  for (y = 0; y < r.h; y++) for (x = 0; x < r.w; x++)
    assertEqual(BF.getPixel(f, c, r.x + x, r.y + y), 1, "double invert restores");

  BF.rectFill(f, c, r, 0); // clear
  assertEqual(BF.getPixel(f, c, 2, 3), 0, "clear: rect empty");
  assertEqual(BF.getPixel(f, c, 0, 0), 1, "clear: outside ink survives");

  // Neighbour glyph untouched by all of the above.
  assertEqual(BF.getPixel(f, 0x42, 0, 0), 0, "neighbour untouched");

  // Bad args throw.
  var threw = false;
  try { BF.rectFill(f, c, { x: 0, y: 0, w: 9, h: 1 }, 1); } catch (e) { threw = true; }
  assert(threw, "rect outside the cell throws");
  threw = false;
  try { BF.rectInvert(f, c, { x: 0, y: 0, w: 0, h: 1 }); } catch (e) { threw = true; }
  assert(threw, "empty rect throws");
});

test("core: rectMove — cut semantics, overlap-safe, clipping counted", function () {
  var f = BF.makeFont(8, 16);
  var c = 0x41;
  // A 2x2 block of ink at (0,0).
  BF.setPixel(f, c, 0, 0, 1); BF.setPixel(f, c, 1, 0, 1);
  BF.setPixel(f, c, 0, 1, 1); BF.setPixel(f, c, 1, 1, 1);
  BF.setPixel(f, c, 5, 5, 1); // outside — must survive
  var r = { x: 0, y: 0, w: 2, h: 2 };

  var res = BF.rectMove(f, c, r, 3, 2);
  assertEqual(res.moved, 4, "all 4 ink px moved");
  assertEqual(res.clipped, 0, "nothing clipped");
  assertEqual(BF.getPixel(f, c, 0, 0), 0, "source cleared");
  assertEqual(BF.getPixel(f, c, 1, 1), 0, "source cleared (2)");
  assertEqual(BF.getPixel(f, c, 3, 2), 1, "block landed at +3,+2");
  assertEqual(BF.getPixel(f, c, 4, 3), 1, "block landed (2)");
  assertEqual(BF.getPixel(f, c, 5, 5), 1, "outside ink survives");

  // Overlapping shift (1px right): source and target overlap — must not smear.
  BF.rectMove(f, c, { x: 3, y: 2, w: 2, h: 2 }, 1, 0);
  assertEqual(BF.getPixel(f, c, 3, 2), 0, "overlap: old left column cleared");
  assertEqual(BF.getPixel(f, c, 4, 2), 1, "overlap: right column in place");
  assertEqual(BF.getPixel(f, c, 5, 2), 1, "overlap: shifted column landed");
  assertEqual(BF.getPixel(f, c, 4, 3), 1, "overlap: row 2 col kept");
  assertEqual(BF.getPixel(f, c, 5, 3), 1, "overlap: row 2 col shifted");

  // Clipping: move a block off the right edge; off-cell ink is lost and counted.
  BF.clearGlyph(f, c);
  BF.setPixel(f, c, 0, 0, 1); BF.setPixel(f, c, 1, 0, 1);
  var res2 = BF.rectMove(f, c, { x: 0, y: 0, w: 2, h: 1 }, 7, 0); // lands at x=7,8
  assertEqual(res2.moved, 1, "one px landed (x=7)");
  assertEqual(res2.clipped, 1, "one px clipped (x=8 off-cell)");
  assertEqual(BF.getPixel(f, c, 7, 0), 1, "landed pixel present");
  assertEqual(BF.getPixel(f, c, 0, 0), 0, "source cleared even with clipping");

  // Zero-offset move is a no-op.
  BF.setPixel(f, c, 2, 2, 1);
  var res3 = BF.rectMove(f, c, { x: 2, y: 2, w: 1, h: 1 }, 0, 0);
  assertEqual(res3.moved, 0, "no-op moved count");
  assertEqual(BF.getPixel(f, c, 2, 2), 1, "no-op leaves the ink");
});

test("core: rectCopy — exact paste (incl. transparent) at same position, source intact", function () {
  var f = BF.makeFont(8, 16);
  var from = 0x41, to = 0x61, r = { x: 1, y: 2, w: 3, h: 2 };
  // Source: L-shape — some ink, some transparent, inside the rect.
  BF.setPixel(f, from, 1, 2, 1);
  BF.setPixel(f, from, 3, 2, 1);
  BF.setPixel(f, from, 1, 3, 1);
  // Target: pre-existing ink inside AND outside the rect.
  BF.setPixel(f, to, 2, 2, 1);    // inside — must be OVERWRITTEN to transparent
  BF.setPixel(f, to, 6, 6, 1);    // outside — must survive

  BF.rectCopy(f, from, to, r);

  assertEqual(BF.getPixel(f, to, 1, 2), 1, "ink pasted");
  assertEqual(BF.getPixel(f, to, 3, 2), 1, "ink pasted (2)");
  assertEqual(BF.getPixel(f, to, 1, 3), 1, "ink pasted (3)");
  assertEqual(BF.getPixel(f, to, 2, 2), 0, "transparent pasted over old ink");
  assertEqual(BF.getPixel(f, to, 2, 3), 0, "transparent pasted (2)");
  assertEqual(BF.getPixel(f, to, 6, 6), 1, "outside-the-rect target ink survives");
  assertEqual(BF.getPixel(f, from, 1, 2), 1, "source intact");
  assertEqual(BF.getPixel(f, from, 2, 2), 0, "source intact (2)");
});
