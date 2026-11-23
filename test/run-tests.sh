#!/bin/sh
# bitforge — run unit tests under JavaScriptCore (jsc). No Node, no browser, no deps.
# Exit code: 0 = all passed, 1 = failures or timeout, 2 = jsc not found.
cd "$(dirname "$0")/.." || exit 2

JSC=""
if JSC="$(command -v jsc 2>/dev/null)"; then
  : # found on PATH (command -v prints the resolved path)
else
  JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
fi
if [ -z "$JSC" ] || [ ! -x "$JSC" ]; then
  echo "error: jsc not found (looked for 'jsc' and the macOS JavaScriptCore framework)" >&2
  exit 2
fi

# Shipped-sample file check (DECISIONS #80): file-level assertions that can't run
# under jsc (it has no file reads). python3 is already this project's server dep.
if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 not found (needed for the shipped-sample file check)" >&2
  exit 2
fi
python3 - <<'PY'
import json
o = json.load(open("samples/small-and-cozy.bitforge"))
assert o["app"] == "bitforge" and o["kind"] == "font-project", "sample: not a bitforge project"
assert (o.get("settings") or {}).get("selCode") == 66, "sample: selCode must be 66 (0x42 'B')"
print("  ok   sample: shipped .bitforge is valid and opens at 0x42 (DECISIONS #80)")
PY
[ $? -eq 0 ] || exit 1

# Watchdog: fail fast if the test run hangs (e.g. an infinite loop in app.js).
# NOTE: the watchdog's output goes to /dev/null on purpose — when we kill the
# watchdog below, its `sleep` child is orphaned but keeps running; without this
# redirect it would hold this script's stdout pipe open and delay any consumer.
TIMEOUT_SECS=60
"$JSC" test/run.js &
pid=$!
( sleep "$TIMEOUT_SECS"; kill "$pid" 2>/dev/null ) >/dev/null 2>&1 &
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
