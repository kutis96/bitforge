/* bitforge — tests for cell resize (BF.resizeFont / BF.cloneFont, DECISIONS #71). */

// 8x16 with ink at three known spots: interior, bottom-right corner,
// top-left corner.
function rzFont() {
  var f = BF.makeFont(8, 16);
  BF.setPixel(f, 0x41, 3, 5, 1);
  BF.setPixel(f, 0x41, 7, 15, 1);
  BF.setPixel(f, 0x42, 0, 0, 1);
  return f;
}
function rzInk(f) {
  var n = 0;
  for (var i = 0; i < f.data.length; i++) n += f.data[i];
  return n;
}

test("resize: extend right keeps ink in place, adds blank columns", function () {
  var f = rzFont();
  var r = BF.resizeFont(f, { dTop: 0, dBottom: 0, dLeft: 0, dRight: 2 });
  assertEqual(r.font.width, 10);
  assertEqual(r.font.height, 16);
  assertEqual(r.inkClipped, 0, "nothing clipped");
  assertEqual(BF.getPixel(r.font, 0x41, 3, 5), 1, "interior pixel unmoved");
  assertEqual(BF.getPixel(r.font, 0x41, 7, 15), 1, "right-edge pixel unmoved");
  assertEqual(BF.getPixel(r.font, 0x41, 9, 15), 0, "new column is blank");
  assertEqual(rzInk(r.font), 3, "ink count preserved");
  assertEqual(rzInk(f), 3, "input font untouched");
});

test("resize: extend left shifts ink and vertical guides right", function () {
  var f = rzFont();
  f.guidelines.push({ o: "v", off: 4, label: "L", color: "#333" });
  f.guidelines.push({ o: "h", off: 12, label: "desc", color: "#333" });
  var r = BF.resizeFont(f, { dTop: 0, dBottom: 0, dLeft: 2, dRight: 0 });
  assertEqual(r.font.width, 10);
  assertEqual(BF.getPixel(r.font, 0x41, 5, 5), 1, "interior ink shifted +2 right");
  assertEqual(BF.getPixel(r.font, 0x42, 2, 0), 1, "left-edge ink shifted");
  assertEqual(r.font.guidelines[0].off, 6, "v guide shifted +2");
  assertEqual(r.font.guidelines[1].off, 12, "h guide untouched");
});

test("resize: extend top shifts ink and horizontal guides down", function () {
  var f = rzFont();
  f.guidelines.push({ o: "h", off: 5, label: "x", color: "#333" });
  var r = BF.resizeFont(f, { dTop: 3, dBottom: 0, dLeft: 0, dRight: 0 });
  assertEqual(r.font.height, 19);
  assertEqual(BF.getPixel(r.font, 0x42, 0, 3), 1, "top-edge ink shifted +3 down");
  assertEqual(BF.getPixel(r.font, 0x41, 3, 8), 1, "interior ink shifted");
  assertEqual(r.font.guidelines[0].off, 8, "h guide shifted +3");
});

test("resize: crop one edge clips only that edge's ink", function () {
  var r = BF.resizeFont(rzFont(), { dTop: 0, dBottom: 0, dLeft: 0, dRight: -1 });
  assertEqual(r.font.width, 7, "crop right");
  assertEqual(r.inkClipped, 1, "the right-edge pixel");
  r = BF.resizeFont(rzFont(), { dTop: 0, dBottom: 0, dLeft: -1, dRight: 0 });
  assertEqual(r.inkClipped, 1, "crop left: the left-edge pixel");
  assertEqual(BF.getPixel(r.font, 0x41, 2, 5), 1, "surviving ink shifted left");
  r = BF.resizeFont(rzFont(), { dTop: -1, dBottom: 0, dLeft: 0, dRight: 0 });
  assertEqual(r.inkClipped, 1, "crop top: the top-edge pixel");
  r = BF.resizeFont(rzFont(), { dTop: 0, dBottom: -1, dLeft: 0, dRight: 0 });
  assertEqual(r.inkClipped, 1, "crop bottom: the bottom-edge pixel");
});

test("resize: crop all four edges counts each lost pixel once", function () {
  var r = BF.resizeFont(rzFont(), { dTop: -1, dBottom: -1, dLeft: -1, dRight: -1 });
  assertEqual(r.font.width, 6);
  assertEqual(r.font.height, 14);
  assertEqual(r.inkClipped, 2, "the two corner pixels (each counted once)");
  assertEqual(BF.getPixel(r.font, 0x41, 2, 4), 1, "interior ink shifted to (2,4)");
});

test("resize: guides clamp to the new cell edges", function () {
  var f = rzFont();
  f.guidelines.push({ o: "h", off: 15, label: "desc", color: "#333" });
  f.guidelines.push({ o: "v", off: 7, label: "R", color: "#333" });
  var r = BF.resizeFont(f, { dTop: 0, dBottom: -4, dLeft: 0, dRight: -3 });
  assertEqual(r.font.height, 12);
  assertEqual(r.font.width, 5);
  assertEqual(r.font.guidelines[0].off, 12, "h guide clamped to newH");
  assertEqual(r.font.guidelines[1].off, 5, "v guide clamped to newW");
});

test("resize: invalid deltas and out-of-range new dims throw", function () {
  assertThrows(function () { BF.resizeFont(rzFont(), { dTop: -20, dBottom: 0, dLeft: 0, dRight: 0 }); });
  assertThrows(function () { BF.resizeFont(rzFont(), { dTop: 0, dBottom: 0, dLeft: -8, dRight: 0 }); }, "width 0");
  assertThrows(function () { BF.resizeFont(rzFont(), { dTop: 1.5, dBottom: 0, dLeft: 0, dRight: 0 }); }, "fractional");
  assertThrows(function () { BF.resizeFont(rzFont(), { dTop: 0, dBottom: "2", dLeft: 0, dRight: 0 }); }, "string");
});

test("resize: name, status and silences survive; cloneFont deep-copies", function () {
  var f = rzFont();
  f.name = "Keeper";
  f.status[0x41] = 2;
  f.silences["edge"] = { 66: true };
  f.guidelines.push({ o: "h", off: 12, label: "desc", color: "#333" });
  var r = BF.resizeFont(f, { dTop: 2, dBottom: 0, dLeft: 1, dRight: 0 });
  assertEqual(r.font.name, "Keeper", "name kept");
  assertEqual(r.font.status[0x41], 2, "status kept");
  assert(r.font.silences["edge"][66], "silences kept");
  // cloneFont: mutating the original must not touch the clone
  var c = BF.cloneFont(f);
  BF.setPixel(f, 0x41, 3, 5, 0);
  f.guidelines.pop();
  f.silences["edge"][66] = false;
  delete f.silences["edge"][66];
  assertEqual(BF.getPixel(c, 0x41, 3, 5), 1, "data independent");
  assertEqual(c.guidelines.length, 1, "guidelines independent");
  assert(c.silences["edge"][66], "silences independent");
});
