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

  // Runs tests in order. A test may be synchronous OR return a Promise (async
  // test): if it returns a thenable we await it before moving on, so async tests
  // still run serially, in registration order, and the process only exits once
  // every one has settled. Sync tests return undefined and behave as before.
  function __runAll() {
    var i = 0;
    function finish() {
      print("");
      print("TOTAL " + (passed + failed) + "   passed " + passed + "   failed " + failed);
      if (typeof quit === "function") quit(failed ? 1 : 0);
    }
    function next() {
      if (i >= tests.length) { finish(); return; }
      var t = tests[i++];
      var r;
      try { r = t.fn(); } catch (e) {
        failed++;
        print("FAIL   " + t.name + "  ::  " + ((e && e.message) ? e.message : e));
        next();
        return;
      }
      if (r && typeof r.then === "function") {
        r.then(function () { passed++; print("  ok   " + t.name); next(); },
               function (e) { failed++; print("FAIL   " + t.name + "  ::  " + ((e && e.message) ? e.message : e)); next(); });
      } else {
        passed++;
        print("  ok   " + t.name);
        next();
      }
    }
    next();
  }

  root.test = test;
  root.assert = assert;
  root.assertEqual = assertEqual;
  root.assertThrows = assertThrows;
  root.__runAll = __runAll;
})(typeof globalThis !== "undefined" ? globalThis : this);
