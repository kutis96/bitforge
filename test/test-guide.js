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
  // Lines sit on grid boundaries, BETWEEN pixels (DECISIONS #65):
  f.guidelines.push({ o: "h", off: 2, label: GB.top, color: "#888888" });     // between rows 1|2
  f.guidelines.push({ o: "h", off: 14, label: GB.bottom, color: "#888888" }); // between rows 13|14
  BF.setPixel(f, 5, 3, 2, 1);  // first row BELOW the top line (inside)
  BF.setPixel(f, 5, 3, 13, 1); // last row ABOVE the bottom line (inside)
  BF.setPixel(f, 5, 3, 8, 1);
  assertEqual(BF.guideViolations(f, 5).length, 0, "ink within bounds is clean");
});

test("guide: ink past a bound reports the guide label + overshoot in px", function () {
  var f = BF.makeFont(8, 16);
  f.guidelines.push({ o: "h", off: 2, label: GB.top, color: "#888888" });
  f.guidelines.push({ o: "v", off: 5, label: GB.right, color: "#cc8800" });
  BF.setPixel(f, 5, 0, 0, 1);    // 2px above the ascender
  BF.setPixel(f, 5, 7, 8, 1);    // 3px right of the R line (cols 5,6,7 past the line at boundary 5)
  var v = BF.guideViolations(f, 5);
  assertEqual(v.length, 2, "two crossed bounds");
  var byBound = {};
  for (var i = 0; i < v.length; i++) byBound[v[i].bound] = v[i];
  assertEqual(byBound.top.over, 2, "2px above asc");
  assertEqual(byBound.top.label, "asc", "top violation names the guide");
  assertEqual(byBound.right.over, 3, "3px right of R");
  assertEqual(byBound.right.label, "R", "right violation names the guide");
  assert(byBound.bottom === undefined && byBound.left === undefined, "uncrossed bounds absent");
});

test("guide: ink below a desc bound / left of an L bound reports label + overshoot", function () {
  var f = BF.makeFont(8, 16);
  f.guidelines.push({ o: "h", off: 15, label: GB.bottom, color: "#888888" }); // default desc position: line between rows 14|15
  f.guidelines.push({ o: "v", off: 2, label: GB.left, color: "#cc8800" });
  BF.setPixel(f, 9, 3, 15, 1); // bottom row: 1px below the desc line
  BF.setPixel(f, 9, 0, 5, 1);  // col 0: 2px left of the L line
  var v = BF.guideViolations(f, 9);
  var byBound = {};
  for (var i = 0; i < v.length; i++) byBound[v[i].bound] = v[i];
  assertEqual(v.length, 2, "two crossed bounds");
  assertEqual(byBound.bottom.over, 1, "1px below desc");
  assertEqual(byBound.bottom.label, "desc", "bottom violation names the guide");
  assertEqual(byBound.left.over, 2, "2px left of L");
  assertEqual(byBound.left.label, "L", "left violation names the guide");
});

test("guide: edge guides (off 0 / off dim) are valid positions and cross nothing [AB]", function () {
  var f = BF.makeFont(8, 16);
  f.guidelines.push({ o: "h", off: 0, label: GB.top, color: "#888888" });    // top edge of the cell
  f.guidelines.push({ o: "h", off: 16, label: GB.bottom, color: "#888888" }); // bottom edge of the cell
  f.guidelines.push({ o: "v", off: 0, label: GB.left, color: "#cc8800" });   // left edge of the cell
  f.guidelines.push({ o: "v", off: 8, label: GB.right, color: "#cc8800" });  // right edge of the cell
  BF.setPixel(f, 4, 0, 0, 1);    // top-left corner pixel (on two edges)
  BF.setPixel(f, 4, 7, 15, 1);   // bottom-right corner pixel (on two edges)
  assertEqual(BF.guideViolations(f, 4).length, 0, "ink at the cell edges is inside edge guides");
  // Pull the right bound one pixel in and the edge ink is flagged.
  f.guidelines[3].off = 7; // line between cols 6|7 -> col 7 ink is past it
  var v = BF.guideViolations(f, 4);
  assertEqual(v.length, 1, "edge guide moved one pixel in flags the edge ink");
  assertEqual(v[0].bound, "right", "right bound flagged");
  assertEqual(v[0].over, 1, "overshoot is 1px");
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

// ---------- DECISIONS #94: canonical guide + duplicates + hid ----------

test("guide: guideCanonical resolves duplicates per the consumer's historical rule", function () {
  // base / cap / x -> LAST in array order (what baselineOf always picked)
  var f = BF.makeFont(8, 16);
  f.guidelines.push({ o: "h", off: 10, label: "base", color: "#dd2222" });
  f.guidelines.push({ o: "h", off: 12, label: "base", color: "#dd2222" });
  f.guidelines.push({ o: "h", off: 8,  label: "base", color: "#dd2222" });
  assertEqual(BF.guideCanonical(f, "base").off, 8, "base: last in array order wins");
  // asc / desc / L / R -> OUTERMOST (what guideBounds always picked)
  f.guidelines.length = 0;
  f.guidelines.push({ o: "h", off: 4, label: GB.top, color: "#888888" });
  f.guidelines.push({ o: "h", off: 1, label: GB.top, color: "#888888" });
  f.guidelines.push({ o: "h", off: 13, label: GB.bottom, color: "#888888" });
  f.guidelines.push({ o: "h", off: 15, label: GB.bottom, color: "#888888" });
  f.guidelines.push({ o: "v", off: 2, label: GB.left, color: "#cc8800" });
  f.guidelines.push({ o: "v", off: 1, label: GB.left, color: "#cc8800" });
  f.guidelines.push({ o: "v", off: 5, label: GB.right, color: "#cc8800" });
  f.guidelines.push({ o: "v", off: 7, label: GB.right, color: "#cc8800" });
  assertEqual(BF.guideCanonical(f, GB.top).off, 1, "asc: topmost wins");
  assertEqual(BF.guideCanonical(f, GB.bottom).off, 15, "desc: lowest wins");
  assertEqual(BF.guideCanonical(f, GB.left).off, 1, "L: leftmost wins");
  assertEqual(BF.guideCanonical(f, GB.right).off, 7, "R: rightmost wins");
  assertEqual(BF.guideCanonical(f, "cap"), null, "cap absent -> null");
});

test("guide: guideDuplicates excludes exactly the canonical one", function () {
  var f = BF.makeFont(8, 16);
  var a = { o: "h", off: 10, label: "base", color: "#dd2222" };
  var b = { o: "h", off: 12, label: "base", color: "#dd2222" };
  var c = { o: "h", off: 8,  label: "base", color: "#dd2222" };
  f.guidelines.push(a, b, c);
  var dups = BF.guideDuplicates(f, "base");
  assertEqual(dups.length, 2, "two duplicates of three");
  assert(dups[0] === a && dups[1] === b, "array order kept; the canonical (c, last) is excluded");
  assertEqual(BF.guideDuplicates(f, "cap").length, 0, "no cap guides -> no dups");
  // outermost canonical for bound labels
  f.guidelines.length = 0;
  var t1 = { o: "h", off: 4, label: GB.top, color: "#888888" };
  var t2 = { o: "h", off: 1, label: GB.top, color: "#888888" };
  f.guidelines.push(t1, t2);
  var dd = BF.guideDuplicates(f, GB.top);
  assertEqual(dd.length, 1, "one duplicate");
  assert(dd[0] === t1, "the non-outermost (t1) is the duplicate");
});

test("guide: hid survives blob round-trip and clone (absent = visible)", function () {
  var f = BF.makeFont(8, 16);
  f.guidelines.push({ o: "h", off: 13, label: "base", color: "#dd2222", hid: true });
  f.guidelines.push({ o: "h", off: 1, label: "asc", color: "#888888" }); // no hid -> visible
  var f2 = BF.fontFromBlob(BF.fontToBlob(f));
  assertEqual(f2.guidelines.length, 2, "both guides round-trip");
  assertEqual(f2.guidelines[0].hid, true, "hid: true survives");
  assert(!f2.guidelines[1].hid, "missing hid -> visible (false)");
  // malformed hid values are coerced to visible
  var f3 = BF.fontFromBlob({ w: 8, h: 16, g: [{ o: "h", off: 5, label: "x", color: "#000", hid: "yes" }] });
  assert(!f3.guidelines[0].hid, "hid: \"yes\" (not true) -> visible");
  // cloneFont copies the flag
  var f4 = BF.cloneFont ? BF.cloneFont(f) : null;
  if (f4) assertEqual(f4.guidelines[0].hid, true, "cloneFont copies hid");
});
