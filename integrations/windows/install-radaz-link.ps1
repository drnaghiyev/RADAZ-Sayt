param(
  [Parameter(Mandatory=$true)][string]$SiteOrigin,
  [string]$ViewerOrigin='http://localhost:5173',
  [string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'Programs\RADAZ')
)
$ErrorActionPreference='Stop'
$site=[Uri]$SiteOrigin
$viewer=[Uri]$ViewerOrigin
if ($site.Scheme -notin @('https','http') -or $site.AbsolutePath -ne '/' -or $site.Query -or $site.Fragment -or $site.UserInfo) { throw 'Use an exact website origin.' }
if ($site.Scheme -eq 'http' -and $site.Host -notin @('localhost','127.0.0.1')) { throw 'Use HTTPS for a non-local site.' }
if ($viewer.Host -notin @('localhost','127.0.0.1') -or $viewer.Scheme -ne 'http') { throw 'Desktop Viewer must be a local RADAZ origin.' }
if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot 'launcher.ps1'))) { throw 'Installed RADAZ launcher not found.' }
$destination=Join-Path $env:LOCALAPPDATA 'RADAZ-Site-Link'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'open-radaz-link.ps1') -Destination (Join-Path $destination 'open-radaz-link.ps1') -Force
@{siteOrigin=$site.GetLeftPart([UriPartial]::Authority);viewerOrigin=$viewer.GetLeftPart([UriPartial]::Authority);installRoot=(Resolve-Path -LiteralPath $InstallRoot).Path} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'config.json') -Encoding UTF8
$key='HKCU:\Software\Classes\radaz'
New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-Item -Path $key -Value 'URL:RADAZ site study launcher'
New-ItemProperty -Path $key -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
$powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$handler=Join-Path $destination 'open-radaz-link.ps1'
Set-Item -Path "$key\shell\open\command" -Value ('"{0}" -NoProfile -WindowStyle Hidden -File "{1}" -Link "%1"' -f $powershell,$handler)
Write-Output 'RADAZ URL handler installed for the current Windows user. The installed RADAZ build must include the site receiver.'
