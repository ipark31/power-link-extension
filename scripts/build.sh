#!/usr/bin/env bash
# Builds dist/ (clean copy of the extension) and release/power-link-v<version>.zip
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(node -p "require('./manifest.json').version" 2>/dev/null || python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
rm -rf dist && mkdir -p dist release
cp manifest.json dist/
cp -r icons src native-host dist/
( cd dist && zip -qr "../release/power-link-v${VER}.zip" . )
echo "Built dist/ and release/power-link-v${VER}.zip"
