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
# [Z.4] default sample is spcct16 (opens at 'b'); validate every shipped sample.
manifest = json.load(open("samples/manifest.json"))
assert isinstance(manifest, list) and manifest, "manifest: non-empty array"
defaults = [e for e in manifest if e.get("default") is True]
assert len(defaults) == 1, "manifest: exactly one default sample (got %d)" % len(defaults)
for e in manifest:
    o = json.load(open("samples/" + e["file"]))
    assert o.get("app") == "bitforge" and o.get("kind") == "font-project", "sample %r: not a bitforge project" % e["id"]
    assert o["font"]["w"] >= 1 and o["font"]["h"] >= 1, "sample %r: bad dims" % e["id"]
d = defaults[0]
o = json.load(open("samples/" + d["file"]))
assert (o.get("settings") or {}).get("selCode") == 98, "default sample: selCode must be 98 (0x62 'b')"
print("  ok   samples: %d shipped .bitforge(s) valid; default '%s' opens at 0x62 (DECISIONS #80)" % (len(manifest), d["id"]))
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
