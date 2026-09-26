#!/usr/bin/env bash
# Usage: scripts/bump.sh 2.0.8
# Sets manifest version, version_name and name ("Power Link v<ver>", shown in Chrome's side panel header).
set -euo pipefail
cd "$(dirname "$0")/.."
VER="${1:?version required, e.g. 2.0.8}"
node - "$VER" <<'JS'
const fs = require('fs');
const v = process.argv[2];
const p = 'manifest.json';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/"name": "Power Link[^"]*"/, `"name": "Power Link v${v}"`);
s = s.replace(/"version": "[^"]*"/, `"version": "${v}"`);
s = s.replace(/"version_name": "[^"]*"/, `"version_name": "${v}"`);
fs.writeFileSync(p, s);
JS
echo "manifest → $VER"
