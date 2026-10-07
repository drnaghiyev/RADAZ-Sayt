$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
python -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ qurasdirin.' }
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Python paketleri yuklenmedi.' }
Write-Host 'Hazirdir. radaz-clinic.json faylini bu qovluga qoyun.'
Write-Host '.venv\Scripts\python.exe bridge.py --config radaz-clinic.json --check'
Write-Host '.venv\Scripts\python.exe bridge.py --config radaz-clinic.json'
