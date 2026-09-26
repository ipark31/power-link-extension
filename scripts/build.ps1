# Windows: builds dist\ and release\power-link-v<version>.zip
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$ver = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force dist, release | Out-Null
Copy-Item manifest.json dist\
Copy-Item icons, src dist\ -Recurse
$zip = "release\power-link-v$ver.zip"
Remove-Item $zip -ErrorAction SilentlyContinue
Compress-Archive -Path dist\* -DestinationPath $zip
Write-Host "Built dist\ and $zip"
