/* bitforge — unit tests: [1] Font model */

test("validateDims: accepts valid integers", function () {
  assertEqual(BF.validateDims(8, 16).ok, true);
  assertEqual(BF.validateDims(1, 1).ok, true);
  assertEqual(BF.validateDims(64, 64).ok, true);
});

test("validateDims: rejects non-integer / out-of-range / non-number", function () {
  assertEqual(BF.validateDims(7.5, 16).ok, false, "fractional width");
  assertEqual(BF.validateDims(8, 16.5).ok, false, "fractional height");
  assertEqual(BF.validateDims(0, 16).ok, false, "zero width");
  assertEqual(BF.validateDims(8, 0).ok, false, "zero height");
  assertEqual(BF.validateDims(-8, 16).ok, false, "negative width");
  assertEqual(BF.validateDims("8", 16).ok, false, "string width");
  assertEqual(BF.validateDims(NaN, 16).ok, false, "NaN width");
});

test("makeFont: blank buffer, correct dimensions and length", function () {
  var f = BF.makeFont(8, 16);
  assertEqual(f.width, 8);
  assertEqual(f.height, 16);
  assertEqual(f.data.length, 256 * 8 * 16);
  var allZero = true;
  for (var i = 0; i < f.data.length; i++) if (f.data[i] !== 0) { allZero = false; break; }
  assert(allZero, "new font must be entirely transparent");
});

test("makeFont: throws on invalid dims", function () {
  assertThrows(function () { BF.makeFont(0, 16); });
  assertThrows(function () { BF.makeFont(8, 0); });
  assertThrows(function () { BF.makeFont(7.5, 16); });
});

test("pixel get/set round-trips and defaults to 0", function () {
  var f = BF.makeFont(8, 16);
  assertEqual(BF.getPixel(f, 65, 3, 4), 0);
  BF.setPixel(f, 65, 3, 4, 1);
  assertEqual(BF.getPixel(f, 65, 3, 4), 1);
  BF.setPixel(f, 65, 3, 4, 0);
  assertEqual(BF.getPixel(f, 65, 3, 4), 0);
});

test("pixels are independent per glyph", function () {
  var f = BF.makeFont(8, 16);
  BF.setPixel(f, 0, 0, 0, 1);
  BF.setPixel(f, 1, 0, 0, 1);
  assertEqual(BF.getPixel(f, 0, 0, 0), 1);
  assertEqual(BF.getPixel(f, 1, 0, 0), 1);
  assertEqual(BF.getPixel(f, 2, 0, 0), 0, "third glyph must stay clear");
});

test("out-of-bounds: get returns 0, set throws", function () {
  var f = BF.makeFont(8, 16);
  assertEqual(BF.getPixel(f, 65, 8, 0), 0, "x == width");
  assertEqual(BF.getPixel(f, 65, 0, 16), 0, "y == height");
  assertEqual(BF.getPixel(f, 256, 0, 0), 0, "code == 256");
  assertEqual(BF.getPixel(f, -1, 0, 0), 0, "code == -1");
  assertThrows(function () { BF.setPixel(f, 65, 8, 0, 1); }, "set x==width");
  assertThrows(function () { BF.setPixel(f, 256, 0, 0, 1); }, "set code==256");
});

test("clearGlyph clears only the target glyph", function () {
  var f = BF.makeFont(8, 16);
  BF.setPixel(f, 10, 0, 0, 1);
  BF.setPixel(f, 10, 7, 15, 1);
  BF.setPixel(f, 11, 0, 0, 1);
  BF.clearGlyph(f, 10);
  assertEqual(BF.getPixel(f, 10, 0, 0), 0);
  assertEqual(BF.getPixel(f, 10, 7, 15), 0);
  assertEqual(BF.getPixel(f, 11, 0, 0), 1, "neighbouring glyph must be untouched");
});

test("rowBits: rightmost pixel is the MSB (width <= 32)", function () {
  var f = BF.makeFont(8, 16);
  BF.setPixel(f, 0, 0, 0, 1); // x=0 -> bit 0
  BF.setPixel(f, 0, 7, 0, 1); // x=7 -> bit 7 (MSB)
  assertEqual(BF.rowBits(f, 0, 0), (1 << 7) | (1 << 0), "bits 0 and 7 set");
  assertEqual(BF.rowBits(f, 0, 1), 0, "untouched row is 0");
});

test("rowBitsString: MSB (rightmost pixel) first => visual row reversed", function () {
  var f = BF.makeFont(4, 2);
  // glyph 0 row 0, visual left->right: x=0:1, x=1:0, x=2:1, x=3:0
  BF.setPixel(f, 0, 0, 0, 1);
  BF.setPixel(f, 0, 2, 0, 1);
  // string = p[3] p[2] p[1] p[0] = 0 1 0 1
  assertEqual(BF.rowBitsString(f, 0, 0), "0101");
});

test("rowBitsString: correct for widths beyond 32 bits", function () {
  var f = BF.makeFont(40, 2);
  BF.setPixel(f, 5, 0, 0, 1);  // leftmost (x=0)  -> last char (LSB)
  BF.setPixel(f, 5, 39, 0, 1); // rightmost (x=39) -> first char (MSB)
  var s = BF.rowBitsString(f, 5, 0);
  assertEqual(s.length, 40);
  assertEqual(s.charAt(0), "1", "MSB = rightmost pixel");
  assertEqual(s.charAt(39), "1", "LSB = leftmost pixel");
  var zeros = "";
  for (var i = 0; i < 38; i++) zeros += "0";
  assertEqual(s.slice(1, 39), zeros, "middle must be zeros");
});

test("rowBitsString: empty/invalid returns empty string", function () {
  var f = BF.makeFont(8, 16);
  assertEqual(BF.rowBitsString(f, 0, -1), "");
  assertEqual(BF.rowBitsString(f, 0, 16), "");
  assertEqual(BF.rowBitsString(f, 256, 0), "");
});

test("model: makeFont initializes silences for QA silencing (DECISIONS #59)", function () {
  var f = BF.makeFont(8, 16);
  assert(f.silences !== null && typeof f.silences === "object", "silences is an object");
  assertEqual(Object.keys(f.silences).length, 0, "starts empty");
});

test("model: makeFont defaults the face name to \"font\" (DECISIONS #70)", function () {
  assertEqual(BF.makeFont(8, 16).name, "font");
});
