/* bitforge — tests for glyph status (BF.statusCounts, makeFont.status). */

test("makeFont: status array is 256 zeros (all unfinished)", function () {
  var f = BF.makeFont(4, 4);
  assert(f.status instanceof Uint8Array || Object.prototype.toString.call(f.status) === "[object Uint8Array]", "status is a Uint8Array");
  assertEqual(f.status.length, 256);
  for (var i = 0; i < 256; i += 37) assertEqual(f.status[i], 0);
});

test("statusCounts: fresh font is all unfinished", function () {
  var c = BF.statusCounts(BF.makeFont(8, 16));
  assertEqual(c.all.unfinished, 256);
  assertEqual(c.all.wip, 0);
  assertEqual(c.all.done, 0);
  assertEqual(c.printable.unfinished, 95, "printable range is 0x20..0x7E = 95");
});

test("statusCounts: mixed statuses split all vs printable", function () {
  var f = BF.makeFont(8, 16);
  f.status[1] = 1;      // wip, non-printable
  f.status[0x41] = 2;   // done, printable 'A'
  f.status[0x20] = 1;   // wip, printable ' '
  var c = BF.statusCounts(f);
  assertEqual(c.all.done, 1);
  assertEqual(c.all.wip, 2);
  assertEqual(c.all.unfinished, 253);
  assertEqual(c.printable.done, 1);
  assertEqual(c.printable.wip, 1, "space is printable, 0x01 is not");
  assertEqual(c.printable.unfinished, 93);
});
