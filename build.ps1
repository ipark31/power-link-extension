# Build script for Smart Link Extractor extension

$distDir = Join-Path $PSScriptRoot "dist"

# 1. Clear or create the dist directory
if (Test-Path $distDir) {
    Remove-Item -Path $distDir -Recurse -Force
}
New-Item -ItemType Directory -Path $distDir -Force

# 2. Copy manifest.json
Copy-Item -Path (Join-Path $PSScriptRoot "manifest.json") -Destination $distDir

# 3. Copy HTML files
Copy-Item -Path (Join-Path $PSScriptRoot "*.html") -Destination $distDir

# 4. Copy JS files
Copy-Item -Path (Join-Path $PSScriptRoot "*.js") -Destination $distDir -Exclude "build.ps1"

# 5. Copy CSS files
Copy-Item -Path (Join-Path $PSScriptRoot "*.css") -Destination $distDir

# 6. Copy icons directory if it exists
if (Test-Path (Join-Path $PSScriptRoot "icons")) {
    Copy-Item -Path (Join-Path $PSScriptRoot "icons") -Destination $distDir -Recurse
}

Write-Host "Build complete! Files copied to $distDir" -ForegroundColor Green
