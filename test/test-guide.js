/* bitforge — guideline-violation QA (BF.guideBounds / BF.guideViolations, DECISIONS #47) */

var GB = BF.GUIDE_BOUND_LABELS;

test("guide: bounds come from the asc/desc/L/R labelled guides only", function () {
  var f = BF.makeFont(8, 16);
  f.guidelines.push({ o: "h", off: 2, label: GB.top, color: "#888888" });
  f.guidelines.push({ o: "h", off: 14, label: GB.bottom, color: "#888888" });
  f.guidelines.push({ o: "v", off: 1, label: GB.left, color: "#cc8800" });
  f.guidelines.push({ o: "v", off: 6, label: GB.right, color: "#cc8800" });
  f.guidelines.push({ o: "h", off: 13, label: "base", color: "#dd2222" }); // reference-only
  f.guidelines.push({ o: "h", off: 4, label: "x", color: "#2255cc" });     // reference-only
  var b = BF.guideBounds(f);
  assertEqual(b.top.off, 2, "top bound = ascender");
  assertEqual(b.bottom.off, 14, "bottom bound = descender");
  assertEqual(b.left.off, 1, "left bound = L");
  assertEqual(b.right.off, 6, "right bound = R");
});

test("guide: reference-only guides (base/cap/x/H/V) never form bounds", function () {
  var f = BF.makeFont(8, 16);
  f.guidelines.push({ o: "h", off: 13, label: "base", color: "#dd2222" });
  f.guidelines.push({ o: "h", off: 7, label: "H", color: "#444444" });
  f.guidelines.push({ o: "v", off: 3, label: "V", color: "#444444" });
  var b = BF.guideBounds(f);
  assertEqual(b.top, null, "no ascender -> no top bound");
  assertEqual(b.bottom, null, "no descender -> no bottom bound");
  assertEqual(b.left, null, "no L -> no left bound");
  assertEqual(b.right, null, "no R -> no right bound");
});

test("guide: multiple same-labelled guides — the outermost one wins", function () {
  var f = BF.makeFont(8, 16);
  f.guidelines.push({ o: "h", off: 4, label: GB.top, color: "#888888" });
  f.guidelines.push({ o: "h", off: 1, label: GB.top, color: "#888888" });
  f.guidelines.push({ o: "h", off: 13, label: GB.bottom, color: "#888888" });
  f.guidelines.push({ o: "h", off: 15, label: GB.bottom, color: "#888888" });
  var b = BF.guideBounds(f);
  assertEqual(b.top.off, 1, "topmost ascender is the top bound");
  assertEqual(b.bottom.off, 15, "lowest descender is the bottom bound");
});

test("guide: ink on or inside the bound lines violates nothing", function () {
  var f = BF.makeFont(8, 16);
  f.guidelines.push({ o: "h", off: 2, label: GB.top, color: "#888888" });
  f.guidelines.push({ o: "h", off: 14, label: GB.bottom, color: "#888888" });
  BF.setPixel(f, 5, 3, 2, 1);  // exactly on the top bound line
  BF.setPixel(f, 5, 3, 14, 1); // exactly on the bottom bound line
  BF.setPixel(f, 5, 3, 8, 1);
  assertEqual(BF.guideViolations(f, 5).length, 0, "ink within bounds is clean");
});

test("guide: ink past a bound reports the guide label + overshoot in px", function () {
  var f = BF.makeFont(8, 16);
  f.guidelines.push({ o: "h", off: 2, label: GB.top, color: "#888888" });
  f.guidelines.push({ o: "v", off: 5, label: GB.right, color: "#cc8800" });
  BF.setPixel(f, 5, 0, 0, 1);    // 2px above the ascender
  BF.setPixel(f, 5, 7, 8, 1);    // 2px right of the R guide
  var v = BF.guideViolations(f, 5);
  assertEqual(v.length, 2, "two crossed bounds");
  var byBound = {};
  for (var i = 0; i < v.length; i++) byBound[v[i].bound] = v[i];
  assertEqual(byBound.top.over, 2, "2px above asc");
  assertEqual(byBound.top.label, "asc", "top violation names the guide");
  assertEqual(byBound.right.over, 2, "2px right of R");
  assertEqual(byBound.right.label, "R", "right violation names the guide");
  assert(byBound.bottom === undefined && byBound.left === undefined, "uncrossed bounds absent");
});

test("guide: blank glyph and missing bounds produce no violations", function () {
  var f = BF.makeFont(8, 16);
  f.guidelines.push({ o: "h", off: 2, label: GB.top, color: "#888888" });
  assertEqual(BF.guideViolations(f, 10).length, 0, "blank glyph");
  BF.setPixel(f, 10, 3, 0, 1);
  assertEqual(BF.guideViolations(f, 10).length, 1, "ink above asc flags");
  var g2 = BF.makeFont(8, 16); // no guides at all
  BF.setPixel(g2, 10, 3, 0, 1);
  assertEqual(BF.guideViolations(g2, 10).length, 0, "no guides -> no bounds -> no violations");
});
