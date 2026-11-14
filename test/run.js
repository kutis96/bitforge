/* bitforge — test entry point (run under jsc via run-tests.sh).
 * Loads core + harness + every test file, then runs all registered tests.
 */
load("js/core.js");
load("test/harness.js");

// Pure-logic modules
load("test/test-model.js");
load("test/test-verilog.js");
load("test/test-markup.js");
load("test/test-slant.js");
load("test/test-ink.js");
load("test/test-nav.js");
load("test/test-shift.js");
load("test/test-status.js");
load("test/test-dupes.js");
load("test/test-bdf.js");

// DOM smoke test: install the stub, load app.js (registers init as the
// DOMContentLoaded handler), then run the test which invokes init under the stub.
load("test/stub-dom.js");
load("js/app.js");
load("test/test-dom.js");

__runAll();
