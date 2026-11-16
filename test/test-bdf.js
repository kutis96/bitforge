/* bitforge — tests for BDF import/export (BF.parseBDF / BF.toBDF). */

test("BDF roundtrip: parse(toBDF(font)) reproduces the font", function () {
  var f = BF.makeFont(8, 4);
  BF.setPixel(f, 0x41, 0, 0, 1);
  BF.setPixel(f, 0x41, 7, 3, 1);
  BF.setPixel(f, 0x20, 3, 1, 1);
  BF.setPixel(f, 0xFF, 4, 2, 1);
  var p = BF.parseBDF(BF.toBDF(f));
  assertEqual(p.width, 8);
  assertEqual(p.height, 4);
  for (var code = 0; code < 256; code++)
    for (var y = 0; y < 4; y++)
      for (var x = 0; x < 8; x++)
        assertEqual(p.data[(code * 4 + y) * 8 + x], f.data[(code * 4 + y) * 8 + x],
          "pixel (" + x + "," + y + ") of 0x" + code.toString(16));
});

test("BDF: non-multiple-of-4 width survives the roundtrip", function () {
  var f = BF.makeFont(6, 3); // 6 bits/row -> 2 hex digits with 2 pad bits
  BF.setPixel(f, 1, 0, 0, 1); // leftmost pixel = MSB
  BF.setPixel(f, 1, 5, 2, 1); // rightmost pixel
  var p = BF.parseBDF(BF.toBDF(f));
  assertEqual(p.width, 6);
  assertEqual(p.height, 3);
  assertEqual(p.data[(1 * 3 + 0) * 6 + 0], 1, "MSB pixel kept");
  assertEqual(p.data[(1 * 3 + 2) * 6 + 5], 1, "rightmost pixel kept");
  var total = 0;
  for (var y2 = 0; y2 < 3; y2++)
    for (var x2 = 0; x2 < 6; x2++) total += p.data[(1 * 3 + y2) * 6 + x2];
  assertEqual(total, 2, "only the two set pixels (pad bits stay clear)");
});

test("BDF parse: minimal xbd-style fixture with BBX offset", function () {
  var bdf = [
    "STARTFONT 2.1",
    "FONT \"test\"",
    "SIZE 2",
    "FONTBOUNDBOX 4 2 0 0",
    "CHARS 2",
    "SIZE 2",
    "BW 4",
    "DW 4",
    "DH 2",
    "DS 2",
    "CHARWD 2 ( 4 2 4 2 )",
    "STARTCHAR a",
    "ENCODING 97",
    "BBX 2 2 1 0",
    "DWIDTH 4 2",
    "BITMAP",
    "80",
    "40",
    "ENDCHAR",
    "STARTCHAR b",
    "CODES 66 98",
    "BBX 4 1 0 1",
    "BITMAP",
    "f0",
    "ENDCHAR",
    "ENDFONT"
  ].join("\n");
  var p = BF.parseBDF(bdf);
  assertEqual(p.width, 4);
  assertEqual(p.height, 2);
  // 'a': 2x2 bitmap at xoff=1 (rows byte-padded): row0 "80" -> (1,0); row1 "40" -> (2,1)
  assertEqual(p.data[(97 * 2 + 0) * 4 + 1], 1);
  assertEqual(p.data[(97 * 2 + 1) * 4 + 2], 1);
  assertEqual(p.data[(97 * 2 + 0) * 4 + 0], 0);
  assertEqual(p.data[(97 * 2 + 1) * 4 + 1], 0);
  // 'b' via CODES: 4x1 bitmap at yoff=1: "f0" -> (0..3, 1); also stamped at 98
  for (var x = 0; x < 4; x++) {
    assertEqual(p.data[(66 * 2 + 1) * 4 + x], 1, "code 66 row " + x);
    assertEqual(p.data[(98 * 2 + 1) * 4 + x], 1, "code 98 mirrors 66");
  }
  assertEqual(p.data[(66 * 2 + 0) * 4 + 0], 0, "row 0 stays clear");
});

test("BDF parse: official spec example (quoteright) decodes correctly", function () {
  // From the BDF 2.1 standard: BBX 4 6 2 12, rows "70 70 70 60 E0 C0".
  // 4-bit rows byte-padded: "70"=0b01110000 -> pixels 1,2,3; "60"-> 1,2; "e0"-> 0,1,2; "c0"-> 0,1.
  var bdf = [
    "STARTFONT 2.1", "FONT \"t\"", "SIZE 24", "CHARS 1",
    "SIZE 24", "BW 8", "DW 8", "DH 24", "DS 24",
    "STARTCHAR quoteright", "ENCODING 39",
    "BBX 4 6 2 12",
    "BITMAP",
    "70", "70", "70", "60", "e0", "c0",
    "ENDCHAR", "ENDFONT"
  ].join("\n");
  var p = BF.parseBDF(bdf);
  assertEqual(p.width, 8);
  assertEqual(p.height, 24);
  var expect = {
    "12,3": 1, "12,4": 1, "12,5": 1,
    "13,3": 1, "13,4": 1, "13,5": 1,
    "14,3": 1, "14,4": 1, "14,5": 1,
    "15,3": 1, "15,4": 1,
    "16,2": 1, "16,3": 1, "16,4": 1,
    "17,2": 1, "17,3": 1
  };
  var y, x;
  for (y = 0; y < 24; y++) {
    for (x = 0; x < 8; x++) {
      var want = expect[y + "," + x] || 0;
      assertEqual(p.data[(39 * 24 + y) * 8 + x], want, "px (" + x + "," + y + ")");
    }
  }
});

test("BDF parse: first face only (second face ignored)", function () {
  var one = [
    "STARTFONT 2.1", "FONT \"a\"", "SIZE 2", "CHARS 1",
    "SIZE 2", "BW 2", "DW 2", "DH 2", "DS 2",
    "STARTCHAR x", "ENCODING 120", "BBX 2 1 0 0", "BITMAP", "c0", "ENDCHAR",
    "ENDFONT"
  ].join("\n");
  var two = one + "\n" + one.replace("ENCODING 120", "ENCODING 121");
  var p = BF.parseBDF(two);
  assertEqual(p.data[(120 * 2 + 0) * 2 + 0], 1);
  assertEqual(p.data[(120 * 2 + 0) * 2 + 1], 1);
  for (var x = 0; x < 2; x++)
    assertEqual(p.data[(121 * 2 + 0) * 2 + x], 0, "second-face glyph not imported");
});

test("BDF parse: malformed input throws", function () {
  assertThrows(function () { BF.parseBDF("no bdf here at all"); }, "no glyph blocks");
  assertThrows(function () {
    BF.parseBDF(["STARTCHAR x", "ENCODING 1", "BBX 2 1 0 0", "BITMAP", "3", "ENDCHAR", "ENDFONT"].join("\n"));
  }, "missing BW/DH");
  assertThrows(function () {
    BF.parseBDF(["SIZE 2", "BW 2", "DW 2", "DH 2", "DS 2",
      "STARTCHAR x", "ENCODING 1", "BBX 2 2 0 0", "BITMAP", "3", "ENDCHAR", "ENDFONT"].join("\n"));
  }, "short BITMAP");
  assertThrows(function () {
    BF.parseBDF(["SIZE 2", "BW 2", "DW 2", "DH 2", "DS 2",
      "STARTCHAR x", "ENCODING 1", "BBX 2 1 0 0", "BITMAP", "zz", "ENDCHAR", "ENDFONT"].join("\n"));
  }, "non-hex BITMAP");
});

test("BDF export: 256 chars, header fields, trailing newline", function () {
  var f = BF.makeFont(8, 16);
  var txt = BF.toBDF(f);
  var lines = txt.split("\n");
  assertEqual(lines[0], "STARTFONT 2.1");
  assertEqual(txt.charAt(txt.length - 1), "\n", "trailing newline");
  var starts = 0, ends = 0;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("STARTCHAR") === 0) starts++;
    if (lines[i] === "ENDCHAR") ends++;
  }
  assertEqual(starts, 256);
  assertEqual(ends, 256);
  assert(lines.indexOf("BW 8") !== -1, "BW field");
  assert(lines.indexOf("DH 16") !== -1, "DH field");
});

// ---------- face name (DECISIONS #70) ----------

test("BDF: face name goes into the FONT/FAMILY header and roundtrips", function () {
  var f = BF.makeFont(8, 4);
  f.name = "My Face";
  var out = BF.toBDF(f);
  assert(out.indexOf('FONT "My Face"') >= 0, "FONT line has the name");
  assert(out.indexOf('FAMILY "My Face"') >= 0, "FAMILY line has the name");
  assertEqual(BF.parseBDF(out).name, "My Face", "roundtrips back");
  f.name = "Qu\"ote";
  assert(BF.toBDF(f).indexOf('FONT "Quote"') >= 0, "quotes dropped for the BDF label");
});

test("BDF: parse takes the name from the FONT line when present", function () {
  var bdf = [
    "STARTFONT 2.1",
    "FONT \"from-bdf\"",
    "SIZE 2",
    "FONTBOUNDBOX 4 2 0 0",
    "BW 4",
    "DH 2",
    "STARTCHAR a",
    "ENCODING 97",
    "BBX 2 2 0 0",
    "BITMAP",
    "80",
    "40",
    "ENDCHAR",
    "ENDFONT"
  ].join("\n");
  var p = BF.parseBDF(bdf);
  assertEqual(p.name, "from-bdf");
});
