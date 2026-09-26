#!/usr/bin/env bash
# Usage: scripts/bump.sh 2.0.8
# Sets manifest version, version_name and name ("Power Link v<ver>", shown in Chrome's side panel header).
set -euo pipefail
cd "$(dirname "$0")/.."
VER="${1:?version required, e.g. 2.0.8}"
python3 - "$VER" <<'PY'
import re, sys
v = sys.argv[1]
p = 'manifest.json'; s = open(p, encoding='utf-8').read()
s = re.sub(r'"name": "Power Link[^"]*"', f'"name": "Power Link v{v}"', s, count=1)
s = re.sub(r'"version": "[^"]*"', f'"version": "{v}"', s, count=1)
s = re.sub(r'"version_name": "[^"]*"', f'"version_name": "{v}"', s, count=1)
open(p, 'w', encoding='utf-8').write(s)
PY
echo "manifest → $VER"
