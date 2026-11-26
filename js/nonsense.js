/*
 * bitforge — nonsense.js
 * Pure logic, NO DOM / NO canvas. Generates plausible-looking but meaningless
 * text for the Preview tab, so a font can be judged on real-shaped sample
 * text without having to type anything:
 *   - `prose(rng)` — grammatical English made of nonsense words: declarative /
 *     interrogative / exclamative sentences, prepositions, particles, numbers
 *     and counters, bracketed asides; 3–7 sentences.
 *   - `code(rng)`  — a short snippet of plausible JavaScript (var declarations,
 *     a guarded function, a for loop, a return, a call) from a curated pool.
 *
 * Both take an injectable `rng` — a `() => [0,1)` source of randomness — so the
 * output is fully deterministic for a given seed. The app passes `Math.random`;
 * the headless tests pass a seeded LCG. No DOM, no filesystem, no globals the
 * caller didn't hand in (Math.random is only the fallback when no rng is given).
 *
 * Exposes global `BF_NS` (browser + jsc). A standalone, OPTIONAL feature —
 * deliberately kept OUT of core.js (DECISIONS #90, chunk [AD]): it only feeds
 * the Preview text box and nothing else reads it. Keep DOM-free so it stays
 * testable under jsc.
 */
(function (root) {
  "use strict";

  /* ---------- tiny rng helpers (everything flows through rand) ---------- */
  function rand(rng) { return (typeof rng === "function") ? rng() : Math.random(); }
  function int(rng, lo, hi) { return lo + Math.floor(rand(rng) * (hi - lo + 1)); } // inclusive
  function pick(rng, arr) { return arr[Math.floor(rand(rng) * arr.length)]; }
  function chance(rng, p) { return rand(rng) < p; }
  function pickDistinct(rng, arr, not) {
    var v;
    do { v = pick(rng, arr); } while (v === not && arr.length > 1);
    return v;
  }

  /* ---------- nonsense-word machinery (consonant-vowel syllables) ---------- */
  var CONSONANTS = ["b", "c", "d", "f", "g", "k", "l", "m", "n", "p", "r", "s", "t", "v", "w", "z", "h", "j", "y"];
  var VOWELS     = ["a", "e", "i", "o", "u"];
  var ONSETS     = ["bl", "br", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "qu", "st", "sw", "th", "tr", "wr", "sc", "sk", "sp", "sh", "ch", "ph", "v", "z", "y", "h", "w"];
  var CODAS      = ["b", "c", "d", "f", "g", "k", "l", "m", "n", "p", "r", "s", "t", "v", "w", "ft", "nk", "rd", "sk", "mp", "nd", "ld", "sh", "ch", "th", "ng"];

  function syllable(rng) {
    var s = (chance(rng, 0.6)) ? pick(rng, ONSETS) : pick(rng, CONSONANTS);
    s += pick(rng, VOWELS);
    if (chance(rng, 0.5)) s += pick(rng, CODAS);
    return s;
  }
  function word(rng) {
    var n = int(rng, 1, 3), w = "";
    for (var i = 0; i < n; i++) w += syllable(rng);
    return w;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- small grammar pools (all printable ASCII) ---------- */
  var PREPS       = ["across", "along", "amid", "among", "around", "at", "by", "for", "from", "into", "near", "of", "off", "on", "onto", "over", "past", "round", "to", "under", "up", "upon", "with"];
  var NUMWORDS    = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "seventeen", "twenty", "forty", "forty-two", "hundred"];
  var NUMDIGITS   = ["1", "3", "7", "9", "12", "16", "24", "32", "64", "128", "256", "1024"];
  var PARTICLES   = ["ah", "aha", "eh", "hmm", "ooh", "uh", "oh", "hey", "lo", "uh-huh"];

  var DECL = [
    "The {A} {N} {V3} across the {A} {N}.",
    "Some {N}s {V} under the {A} {N}.",
    "{V3} the {A} {N}, and let the {NUM} {V} on.",
    "The {N} was quite {A}.",
    "It {V} for the {A} {N}, and the {N} agreed.",
    "{PART}, the {N} {V} into {P}.",
    "Every {N} {V3} before the {A} {N}."
  ];
  var INTER = [
    "Did the {A} {N} {V} before the {NUM}?",
    "Why did the {N} {V} into the {A} {N}?",
    "Can a {N} {V} without {P}?",
    "Is the {A} {N} really {A}?",
    "How many {N}s are {P}?"
  ];
  // Every template ends with exactly ONE terminal mark (no internal interjection
  // like "Ah! the …"), so sentence boundaries == terminal punctuation.
  var EXCL = [
    "How the {A} {N} {V3}!",
    "What a {A} {N}!",
    "Such a {A} {N}!",
    "The {A} {N} {V3}, {PART}!",
    "Look how the {A} {N} {V3}!"
  ];
  var ASIDES = [
    "(see the {A} {N})",
    "(the {NUM} of them)",
    "[note: the {A} {N}]",
    "(as the {A} {N} insisted)",
    "(at least {NUM} of them)"
  ];

  function num(rng) { return chance(rng, 0.5) ? pick(rng, NUMWORDS) : pick(rng, NUMDIGITS); }

  // Fill {A}{N}{V}{V3}{NUM}{PART}{P} slots (V3 = third-person-singular verb).
  function fill(rng, tpl) {
    var A = word(rng), N = word(rng), V = word(rng);
    var V3 = V + (V.charAt(V.length - 1) === "s" ? "es" : "s");
    var P = pick(rng, PREPS) + " " + (chance(rng, 0.5) ? "the " : "a ") + word(rng) + " " + word(rng);
    return tpl
      .replace(/\{V3\}/g, V3)
      .replace(/\{A\}/g, A)
      .replace(/\{N\}/g, N)
      .replace(/\{V\}/g, V)
      .replace(/\{NUM\}/g, num(rng))
      .replace(/\{PART\}/g, pick(rng, PARTICLES))
      .replace(/\{P\}/g, P);
  }

  function makeSentence(rng, type) {
    var tpl = (type === "inter") ? pick(rng, INTER) : (type === "excl") ? pick(rng, EXCL) : pick(rng, DECL);
    return cap(fill(rng, tpl));
  }

  // Attach a bracketed aside just before the sentence's terminal punctuation.
  function attachAside(rng, s) {
    var aside = fill(rng, pick(rng, ASIDES));
    var m = s.match(/^(.*?)([.?!])$/);
    return m ? m[1] + " " + aside + m[2] : s + " " + aside;
  }

  function shuffle(rng, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = int(rng, 0, i);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // 3–7 sentences; guaranteed one of each sentence type; one carries an aside.
  function prose(rng) {
    var n = int(rng, 3, 7);
    var bag = [makeSentence(rng, "decl"), makeSentence(rng, "inter"), makeSentence(rng, "excl")];
    var pool = ["decl", "decl", "inter", "excl"];
    while (bag.length < n) bag.push(makeSentence(rng, pick(rng, pool)));
    shuffle(rng, bag);
    bag[int(rng, 0, n - 1)] = attachAside(rng, bag[int(rng, 0, n - 1)]);
    return bag.join(" ");
  }

  /* ---------- plausible JS (a curated pool, not fetched source) ---------- */
  var ID_POOL  = ["buf", "idx", "off", "w", "h", "row", "col", "cell", "mask", "slot", "val", "flag", "state", "cur", "glyph", "pixel", "scale", "mode", "depth", "level", "step", "size", "len", "acc", "tmp", "src", "dst", "key", "tag", "bit", "byte"];
  var FN_POOL  = ["drawGlyph", "packRow", "unpack", "clamp", "blend", "encode", "decode", "shift", "fold", "scan", "emit", "apply", "resolve", "commit"];
  var STR_POOL = ["ink", "transparent", "white", "black", "bold", "italic", "slant", "baseline", "cell", "atlas", "font", "rom", "glyph", "pixel"];
  var MASKS    = ["0x01", "0x0f", "0xff", "0x1ff"];

  function code(rng) {
    var a = pick(rng, ID_POOL);
    var b = pickDistinct(rng, ID_POOL, a);
    var c = pickDistinct(rng, ID_POOL, a);
    var fn = pick(rng, FN_POOL);
    var L = [];
    L.push("// " + pick(rng, STR_POOL) + " - " + pick(rng, ["fast path", "edge case", "v2"]));
    L.push("var " + a + " = " + int(rng, 0, 256) + ";");
    L.push("var " + c + " = { " + a + ": " + int(rng, 1, 8) + ", " + b + ": " + int(rng, 1, 16) + " };");
    L.push("function " + fn + "(" + a + ", " + b + ") {");
    L.push("  if (!" + a + ") return " + pick(rng, [b, "0", "null", "false"]) + ";");
    L.push("  for (var " + b + " = 0; " + b + " < " + a + ".length; " + b + "++) {");
    L.push("    " + c + "." + pick(rng, ID_POOL) + " = " + a + "[" + b + "] & " + pick(rng, MASKS) + ";");
    L.push("  }");
    L.push("  return " + pick(rng, [a, b, c]) + ";");
    L.push("}");
    L.push(fn + "(" + a + ", " + pick(rng, ID_POOL) + ");");
    return L.join("\n");
  }

  var api = {
    prose: prose,
    code: code
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    (root || (root = {})).BF_NS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this));
