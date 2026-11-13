/* bitforge — unit tests: [5] Ink / luminance classifier (PNG import)
 * Rule (DECISIONS #7): composite over white, then luminance < 128 => ink.
 */

test("ink: opaque black is ink", function () {
  assertEqual(BF.isInk(0, 0, 0, 255), true);
});

test("ink: opaque white is not ink", function () {
  assertEqual(BF.isInk(255, 255, 255, 255), false);
});

test("ink: fully transparent is not ink, regardless of rgb", function () {
  assertEqual(BF.isInk(0, 0, 0, 0), false);
  assertEqual(BF.isInk(255, 255, 255, 0), false);
});

test("ink: light checkerboard grays are not ink", function () {
  assertEqual(BF.isInk(230, 230, 230, 255), false);
  assertEqual(BF.isInk(200, 200, 200, 255), false);
});

test("ink: dark gray is ink", function () {
  assertEqual(BF.isInk(60, 60, 60, 255), true);
});

test("ink: threshold boundary at 128 (opaque)", function () {
  assertEqual(BF.isInk(127, 127, 127, 255), true, "127 is ink");
  assertEqual(BF.isInk(128, 128, 128, 255), false, "128 is not ink");
});

test("luminance: weighted per channel (green > blue at same level)", function () {
  assert(BF.luminance(0, 128, 0) > BF.luminance(0, 0, 128), "green out-lumas blue");
});

test("luminance: red-only value matches 0.299*r", function () {
  assertEqual(Math.round(BF.luminance(128, 0, 0)), Math.round(0.299 * 128));
});

test("ink: semi-transparent white is still not ink", function () {
  assertEqual(BF.isInk(255, 255, 255, 128), false);
});
