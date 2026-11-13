#!/bin/sh
# bitforge — run unit tests under JavaScriptCore (jsc). No Node, no browser, no deps.
# Exit code: 0 = all passed, 1 = failures, 2 = jsc not found.
cd "$(dirname "$0")/.." || exit 2

JSC="jsc"
if ! command -v jsc >/dev/null 2>&1; then
  JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
fi
if [ ! -x "$JSC" ]; then
  echo "error: jsc not found (looked for 'jsc' and the macOS JavaScriptCore framework)" >&2
  exit 2
fi

exec "$JSC" test/run.js
