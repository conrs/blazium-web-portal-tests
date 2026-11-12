#!/usr/bin/env bash
# Exports the test project with a Blazium editor and a web release template: the Betacade preset to
# <out>/betacade and the plain Web preset to <out>/web. Reports whether the Betacade preset wrote
# index.html (gap 5); when it didn't, copies its HTML to index.html so the other checks still run.
# Usage: tools/export.sh <editor binary> <web template zip> <out dir>
set -euo pipefail
EDITOR=$(realpath "$1") TEMPLATE=$(realpath "$2") OUT=$(realpath -m "$3")
cd "$(dirname "$0")/../project"
rm -rf "$OUT/betacade" "$OUT/web"
mkdir -p "$OUT/betacade" "$OUT/web"
sed "s#@TEMPLATE@#$TEMPLATE#" export_presets.cfg.in > export_presets.cfg
"$EDITOR" --headless --path . --export-release Betacade "$OUT/betacade/SdkTest.html" 2>&1 | grep -E "ERROR|WARNING" || true
"$EDITOR" --headless --path . --export-release Web "$OUT/web/index.html" 2>&1 | grep -E "ERROR|WARNING" || true
cd "$OUT/betacade"
if [ -f index.html ]; then
  echo "GAP 5: FIXED - the Betacade preset wrote index.html"
else
  echo "GAP 5: CONFIRMED - the Betacade preset wrote $(ls ./*.html | xargs -n1 basename | tr '\n' ' ')and no index.html"
  cp SdkTest.html index.html
fi
cp index.html noinject.html
