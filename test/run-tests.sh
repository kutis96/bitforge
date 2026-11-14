#!/bin/sh
# bitforge — run unit tests under JavaScriptCore (jsc). No Node, no browser, no deps.
# Exit code: 0 = all passed, 1 = failures or timeout, 2 = jsc not found.
cd "$(dirname "$0")/.." || exit 2

JSC="jsc"
if ! command -v jsc >/dev/null 2>&1; then
  JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
fi
if [ ! -x "$JSC" ]; then
  echo "error: jsc not found (looked for 'jsc' and the macOS JavaScriptCore framework)" >&2
  exit 2
fi

# Watchdog: fail fast if the test run hangs (e.g. an infinite loop in app.js).
TIMEOUT_SECS=60
"$JSC" test/run.js &
pid=$!
( sleep "$TIMEOUT_SECS"; kill "$pid" 2>/dev/null ) &
watchdog=$!
wait "$pid"
rc=$?
kill "$watchdog" 2>/dev/null
wait "$watchdog" 2>/dev/null
if [ "$rc" -gt 128 ]; then
  echo "error: test run timed out after ${TIMEOUT_SECS}s or was killed (possible infinite loop)" >&2
  exit 1
fi
exit "$rc"
