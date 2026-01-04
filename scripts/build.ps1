# Build script for Power Link extension (Updated for v1.2.0)

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$distDir = Join-Path $projectRoot "dist"

# 1. Clear or create the dist directory
if (Test-Path $distDir) {
    Remove-Item -Path $distDir -Recurse -Force
}
New-Item -ItemType Directory -Path $distDir -Force

# 2. Copy manifest.json
Copy-Item -Path (Join-Path $projectRoot "manifest.json") -Destination $distDir

# 3. Copy src directory (Everything inside src)
Copy-Item -Path (Join-Path $projectRoot "src") -Destination $distDir -Recurse

# 4. Copy assets directory
if (Test-Path (Join-Path $projectRoot "assets")) {
    Copy-Item -Path (Join-Path $projectRoot "assets") -Destination $distDir -Recurse
}

# 5. Copy background.js (if it's in the root)
if (Test-Path (Join-Path $projectRoot "src/core/background.js")) {
    # It's already copied via src/
}

Write-Host "Build complete! Files copied to $distDir" -ForegroundColor Green
Write-Host "Please load the 'dist' folder in Chrome."
