/* Core tests — chunk [S] glyph manipulation (DECISIONS #74). */

test("core: copyGlyphTo — copies the bitmap, leaves source and metadata alone", function () {
  var f = BF.makeFont(4, 2);
  // Source 0x41: one asymmetric ink pattern.
  BF.setPixel(f, 0x41, 0, 0, 1);
  BF.setPixel(f, 0x41, 3, 1, 1);
  // Target 0x61 starts with different ink that must be overwritten.
  BF.setPixel(f, 0x61, 0, 0, 1);
  BF.setPixel(f, 0x61, 1, 1, 1);
  f.status[0x61] = 2; // done — must survive the copy

  BF.copyGlyphTo(f, 0x41, 0x61);

  assertEqual(f.data[0x61 * 8], 1, "target row 0 col 0 (was already 1)");
  assertEqual(BF.getPixel(f, 0x61, 3, 0), 0, "target row 0 col 3 empty (source had no ink there)");
  assertEqual(BF.getPixel(f, 0x61, 0, 2), 0, "target row 0 col 2 stays empty");
  assertEqual(BF.getPixel(f, 0x61, 3, 1), 1, "target row 1 col 3 copied");
  assertEqual(BF.getPixel(f, 0x61, 1, 1), 0, "old target ink overwritten");
  assertEqual(BF.getPixel(f, 0x41, 0, 0), 1, "source untouched");
  assertEqual(BF.getPixel(f, 0x41, 3, 1), 1, "source untouched (2)");
  assertEqual(f.status[0x61], 2, "target status untouched");

  // No-op when copying onto itself (and no throw).
  BF.copyGlyphTo(f, 0x41, 0x41);
  assertEqual(BF.getPixel(f, 0x41, 0, 0), 1, "self-copy no-op");

  // Bad codes throw.
  var threw = false;
  try { BF.copyGlyphTo(f, 256, 1); } catch (e) { threw = true; }
  assert(threw, "source out of range throws");
  threw = false;
  try { BF.copyGlyphTo(f, 1, -1); } catch (e) { threw = true; }
  assert(threw, "target out of range throws");
});

test("core: mirrorGlyph — h and v axes, odd dims, double-mirror identity", function () {
  var f = BF.makeFont(5, 3); // odd width, odd height
  var c = 0x50;
  // Asymmetric single ink at top-left.
  BF.setPixel(f, c, 0, 0, 1);

  BF.mirrorGlyph(f, c, "h");
  assertEqual(BF.getPixel(f, c, 0, 0), 0, "h: original spot empty");
  assertEqual(BF.getPixel(f, c, 4, 0), 1, "h: ink now at right edge, same row");

  BF.mirrorGlyph(f, c, "h"); // double h = identity
  assertEqual(BF.getPixel(f, c, 0, 0), 1, "h twice restores");
  assertEqual(BF.getPixel(f, c, 4, 0), 0, "h twice restores (2)");

  BF.mirrorGlyph(f, c, "v");
  assertEqual(BF.getPixel(f, c, 0, 0), 0, "v: original spot empty");
  assertEqual(BF.getPixel(f, c, 0, 2), 1, "v: ink now at bottom, same column");

  BF.mirrorGlyph(f, c, "v"); // double v = identity
  assertEqual(BF.getPixel(f, c, 0, 0), 1, "v twice restores");

  // Even dims (the default 8x16 case).
  var f2 = BF.makeFont(8, 16);
  BF.setPixel(f2, 1, 0, 0, 1);
  BF.mirrorGlyph(f2, 1, "h");
  assertEqual(BF.getPixel(f2, 1, 7, 0), 1, "8-wide h mirror to right edge");
  BF.mirrorGlyph(f2, 1, "v");
  assertEqual(BF.getPixel(f2, 1, 7, 15), 1, "8x16 h then v lands bottom-right");

  // Other glyphs untouched.
  assertEqual(BF.getPixel(f, 0x51, 0, 0), 0, "neighbour glyph untouched");

  var threw = false;
  try { BF.mirrorGlyph(f, c, "x"); } catch (e) { threw = true; }
  assert(threw, "bad axis throws");
  threw = false;
  try { BF.mirrorGlyph(f, 256, "h"); } catch (e) { threw = true; }
  assert(threw, "bad code throws");
});

test("core: emptyPrintables — blanks 0x21-0x7E, space exempt, non-printables ignored", function () {
  var f = BF.makeFont(8, 16);
  var all = BF.emptyPrintables(f);
  assertEqual(all.length, 94, "blank font: all 0x21..0x7E listed");
  assertEqual(all[0], 0x21, "ascending from 0x21");
  assertEqual(all[93], 0x7e, "ending at 0x7E");
  var hasSpace = false;
  for (var i = 0; i < all.length; i++) if (all[i] === 0x20) hasSpace = true;
  assert(!hasSpace, "space (0x20) never listed");
  for (i = 0; i < all.length; i++) assert(all[i] !== 0x07, "non-printable never listed");

  // Ink in two printables removes them; ink in 0x07 does not.
  BF.setPixel(f, 0x41, 0, 0, 1);
  BF.setPixel(f, 0x7e, 7, 15, 1);
  BF.setPixel(f, 0x07, 0, 0, 1);
  var rest = BF.emptyPrintables(f);
  assertEqual(rest.length, 92, "two fewer blanks");
  var noneA = true, noneT = true, noneCtl = true;
  for (i = 0; i < rest.length; i++) {
    if (rest[i] === 0x41) noneA = false;
    if (rest[i] === 0x7e) noneT = false;
    if (rest[i] === 0x07) noneCtl = false;
  }
  assert(noneA, "0x41 no longer listed");
  assert(noneT, "0x7E no longer listed");
  assert(noneCtl, "0x07 still not listed");
});
