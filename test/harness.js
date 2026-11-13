/*
 * bitforge — tiny test harness (no framework).
 * Loads under jsc. Register tests with test(name, fn); run all via __runAll().
 * __runAll quits the process with exit code 1 if any test failed.
 */
(function (root) {
  "use strict";

  var tests = [];
  var passed = 0;
  var failed = 0;

  function test(name, fn) { tests.push({ name: name, fn: fn }); }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || "assert is false");
  }

  function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error((msg ? msg + ": " : "") +
        "expected " + JSON.stringify(expected) + " got " + JSON.stringify(actual));
    }
  }

  function assertThrows(fn, msg) {
    var threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) throw new Error((msg ? msg + ": " : "") + "expected to throw, did not");
  }

  function __runAll() {
    for (var i = 0; i < tests.length; i++) {
      var t = tests[i];
      try {
        t.fn();
        passed++;
        print("  ok   " + t.name);
      } catch (e) {
        failed++;
        print("FAIL   " + t.name + "  ::  " + ((e && e.message) ? e.message : e));
      }
    }
    print("");
    print("TOTAL " + (passed + failed) + "   passed " + passed + "   failed " + failed);
    if (typeof quit === "function") quit(failed ? 1 : 0);
  }

  root.test = test;
  root.assert = assert;
  root.assertEqual = assertEqual;
  root.assertThrows = assertThrows;
  root.__runAll = __runAll;
})(typeof globalThis !== "undefined" ? globalThis : this);
