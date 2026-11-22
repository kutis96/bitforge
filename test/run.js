/* bitforge — test entry point (run under jsc via run-tests.sh).
 * Loads core + harness + every test file, then runs all registered tests.
 */
load("js/core.js");
load("js/changelog.js"); // BF_CHANGELOG data (tested in test-changelog.js)
load("test/harness.js");

// Pure-logic modules
load("test/test-model.js");
load("test/test-verilog.js");
load("test/test-markup.js");
load("test/test-slant.js");
load("test/test-ink.js");
load("test/test-nav.js");
load("test/test-shift.js");
load("test/test-resize.js");
load("test/test-changelog.js");
load("test/test-glyphops.js");
load("test/test-selectops.js");
load("test/test-status.js");
load("test/test-dupes.js");
load("test/test-edge.js");
load("test/test-guide.js");
load("test/test-bdf.js");
load("test/test-project.js");

// DOM smoke test: install the stub, load app.js (registers init as the
// DOMContentLoaded handler), then run the test which invokes init under the stub.
// (samples/ is served at runtime via fetch; nothing to load here — DECISIONS #78.)
load("test/stub-dom.js");
load("js/app.js");
load("test/test-dom.js");
load("test/test-samples.js");

__runAll();
