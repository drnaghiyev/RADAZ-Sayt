param([Parameter(Mandatory=$true)][string]$Link)
$ErrorActionPreference='Stop'
try {
  $config=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'config.json') | ConvertFrom-Json
  if ($Link.Length -gt 6000) { throw 'Invalid RADAZ link.' }
  $uri=[Uri]$Link
  if ($uri.Scheme -ne 'radaz' -or $uri.Host -ne 'open' -or $uri.UserInfo -or $uri.Fragment) { throw 'Invalid RADAZ action.' }
  Add-Type -AssemblyName System.Web
  $query=[System.Web.HttpUtility]::ParseQueryString($uri.Query)
  if ($query.Count -ne 1 -or -not $query['url']) { throw 'Invalid RADAZ parameters.' }
  $target=[Uri]$query['url']
  if ($target.GetLeftPart([UriPartial]::Authority) -ne $config.viewerOrigin -or $target.UserInfo -or $target.AbsolutePath -ne '/' -or $target.Query) { throw 'Untrusted Viewer origin.' }
  $fragment=[System.Web.HttpUtility]::ParseQueryString($target.Fragment.TrimStart('#'))
  if ($fragment.Count -ne 2 -or $fragment['radaz-site'] -ne $config.siteOrigin -or $fragment['radaz-ticket'] -notmatch '^[A-Za-z0-9_-]{43}$') { throw 'Untrusted website link.' }
  # Launch only the preconfigured installed program; never execute URL data.
  $launcher=Join-Path $config.installRoot 'launcher.ps1'
  & $launcher -NoBrowser
  if ($LASTEXITCODE -ne 0) { throw 'RADAZ could not start.' }
  Start-Process -FilePath $target.AbsoluteUri -WindowStyle Hidden
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show('RADAZ sayt bağlantısı açıla bilmədi. Quraşdırmanı və sayt ünvanını yoxlayın.','RADAZ') | Out-Null
  exit 1
}
