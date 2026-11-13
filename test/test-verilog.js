/* bitforge — unit tests: [2] Verilog $readmemb export */

test("toVerilog: data line count is 256 * height, with trailing newline", function () {
  var f = BF.makeFont(4, 2);
  var lines = BF.toVerilog(f).split("\n");
  assertEqual(lines[lines.length - 1], "", "trailing newline present");
  assertEqual(lines.length - 1, 256 * 2, "number of data lines");
});

test("toVerilog: every data line is exactly `width` bits", function () {
  var f = BF.makeFont(6, 3);
  BF.setPixel(f, 50, 5, 2, 1); // a corner pixel
  var lines = BF.toVerilog(f).split("\n");
  for (var i = 0; i < lines.length - 1; i++) {
    assertEqual(lines[i].length, 6, "line " + i + " must be 6 bits");
  }
});

test("toVerilog: glyph order + MSB (rightmost pixel) first", function () {
  var f = BF.makeFont(4, 2);
  // glyph 0: row0 all ink, row1 empty
  for (var x = 0; x < 4; x++) BF.setPixel(f, 0, x, 0, 1);
  // glyph 1: row0 = leftmost pixel only, row1 = rightmost pixel only
  BF.setPixel(f, 1, 0, 0, 1);
  BF.setPixel(f, 1, 3, 1, 1);
  var lines = BF.toVerilog(f).split("\n");
  assertEqual(lines[0], "1111", "glyph0 row0");
  assertEqual(lines[1], "0000", "glyph0 row1");
  assertEqual(lines[2], "0001", "glyph1 row0 (leftmost pixel = LSB = last char)");
  assertEqual(lines[3], "1000", "glyph1 row1 (rightmost pixel = MSB = first char)");
});

test("toVerilog: glyph N starts at data line N * height", function () {
  var f = BF.makeFont(4, 2);
  BF.setPixel(f, 100, 2, 1, 1); // glyph 100, row 1, column x=2
  var lines = BF.toVerilog(f).split("\n");
  assertEqual(lines[100 * 2 + 0], "0000", "glyph100 row0 empty");
  assertEqual(lines[100 * 2 + 1], "0100", "glyph100 row1, x=2 set");
});

test("toVerilog: a fully-ink row is all ones of the right width", function () {
  var f = BF.makeFont(5, 1);
  for (var x = 0; x < 5; x++) BF.setPixel(f, 7, x, 0, 1);
  var lines = BF.toVerilog(f).split("\n");
  assertEqual(lines[7], "11111", "glyph7 row0 fully ink");
  assertEqual(lines[8], "00000", "glyph8 row0 empty");
});
