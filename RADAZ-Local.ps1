$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $taskNode) { throw 'Node.js 24 qurasdirin ve yeniden acin.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) { npm ci; if ($LASTEXITCODE -ne 0) { throw 'Asililiqlar yuklenmedi.' } }
node scripts/local-server.mjs
