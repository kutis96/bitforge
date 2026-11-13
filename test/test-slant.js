/* bitforge — unit tests: [4] Slant offsets
 * Contract (DECISIONS #11): baseline row = 0; rows above >= 0; rows below < 0.
 */

test("slant: baseline row has offset 0", function () {
  var h = 16, fbb = 5, slope = 2;
  var baseline = (h - 1) - fbb; // 10
  assertEqual(BF.slantRowOffset(baseline, h, fbb, slope), 0);
});

test("slant: every row above the baseline is >= 0", function () {
  var h = 16, fbb = 5, slope = 2;
  var baseline = (h - 1) - fbb; // 10
  for (var y = 0; y < baseline; y++) {
    assert(BF.slantRowOffset(y, h, fbb, slope) >= 0, "y=" + y);
  }
});

test("slant: every row below the baseline is < 0", function () {
  var h = 16, fbb = 5, slope = 2;
  var baseline = (h - 1) - fbb; // 10
  for (var y = baseline + 1; y < h; y++) {
    assert(BF.slantRowOffset(y, h, fbb, slope) < 0, "y=" + y);
  }
});

test("slant: offset grows by 1 per `slope` rows going up", function () {
  var h = 16, fbb = 5, slope = 2;
  assertEqual(BF.slantRowOffset(10, h, fbb, slope), 0);
  assertEqual(BF.slantRowOffset(8, h, fbb, slope), 1);
  assertEqual(BF.slantRowOffset(6, h, fbb, slope), 2);
  assertEqual(BF.slantRowOffset(0, h, fbb, slope), 5);
});

test("slant: defaults (baselineFromBottom=5, slope=2) for height 16", function () {
  assertEqual(BF.slantRowOffset(10, 16), 0, "baseline row");
  assertEqual(BF.slantRowOffset(0, 16), 5, "top row");
  assertEqual(BF.slantRowOffset(15, 16), -3, "bottom row");
});

test("slant: offset is non-increasing from top to bottom", function () {
  var h = 20, fbb = 6, slope = 3;
  var prev = Infinity;
  for (var y = 0; y < h; y++) {
    var o = BF.slantRowOffset(y, h, fbb, slope);
    assert(o <= prev, "must not increase as y grows, at y=" + y);
    prev = o;
  }
});

test("slant: a different baseline shifts the zero point", function () {
  var h = 16;
  // baseline at bottom-most row (fromBottom=0) => baseline row 15
  assertEqual(BF.slantRowOffset(15, h, 0, 2), 0);
  assert(BF.slantRowOffset(0, h, 0, 2) > 0, "top is above baseline");
});
