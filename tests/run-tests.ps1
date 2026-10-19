# Lefuttatja a MomAssistant regressziós tesztjeit egy láthatatlan Edge böngészőben.
# Használat:  .\tests\run-tests.ps1            (minden teszt)
#             .\tests\run-tests.ps1 -Csak Bevásárlás   (csak azok, amelyek nevében ez szerepel)
#             .\tests\run-tests.ps1 -Reszletes (kiírja, melyik teszt épp indul)
#             .\tests\run-tests.ps1 -Lathato   (látható böngészőablakban, hibakereséshez)
#             .\tests\run-tests.ps1 -CsakKiszolgalo -Port 8792   (csak kiszolgál, a tesztoldalt kézzel nyitod meg)
# Kilépési kód: 0 = minden sikeres, 1 = van hibás teszt, 2 = a tesztek nem tudtak lefutni.
# A tesztek egy memóriabeli adatbázison futnak (tests/mock-db.js); a valódi adatokhoz és a Firebase-hez nem nyúlnak.
param([string]$Csak = '', [switch]$Lathato, [int]$Idokorlat = 300, [int]$Port = 0, [switch]$CsakKiszolgalo, [switch]$Reszletes)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host 'Nem találom a Microsoft Edge-et, a tesztek nem futtathatók.' -ForegroundColor Red; exit 2 }

# Szabad port keresése
$port = if ($Port) { $Port } else { 8792 }
while ($port -lt 8830) {
  try { $l = New-Object System.Net.HttpListener; $l.Prefixes.Add("http://localhost:$port/"); $l.Start(); break } catch { $port++ }
}
if (-not $l -or -not $l.IsListening) { Write-Host 'Nem sikerült helyi portot nyitni a tesztekhez.' -ForegroundColor Red; exit 2 }

$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'; '.json' = 'application/json'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.webmanifest' = 'application/manifest+json' }
# Az app a tesztekhez: a Firebase helyett a memóriabeli adatbázist kapja.
$appHtml = [IO.File]::ReadAllText((Join-Path $root 'index.html'), [Text.Encoding]::UTF8)
$appHtml = $appHtml.Replace('<script src="firebase-config.js"></script>', '<script src="tests/mock-db.js"></script><script src="firebase-config.js"></script>')
$configStub = "self.FIREBASE_CONFIG = null; self.FIREBASE_VAPID_KEY = '';"

$edgeProfile = Join-Path $env:TEMP 'momassistant-tesztek-edge'
$url = "http://localhost:$port/" + $(if ($Csak) { '?only=' + [Uri]::EscapeDataString($Csak) } else { '' })
$edgeArgs = @("--user-data-dir=`"$edgeProfile`"", '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--autoplay-policy=no-user-gesture-required')
if (-not $Lathato) { $edgeArgs += @('--headless=new', '--disable-gpu', '--window-size=1200,900') }
$edgeArgs += $url
$proc = if ($CsakKiszolgalo) { $Idokorlat = 3600; $null } else { Start-Process -FilePath $edge -ArgumentList $edgeArgs -PassThru }

Write-Host "Tesztek futnak ($url)..." -ForegroundColor Cyan
$results = $null; $got = $false
$deadline = (Get-Date).AddSeconds($Idokorlat)
try {
  while (-not $got -and (Get-Date) -lt $deadline) {
    # A függő kérést megtartjuk a körök között; újat csak a feldolgozás után indítunk (különben a lejárt várakozás elnyelhet egy kérést).
    if (-not $ar) { $ar = $l.BeginGetContext($null, $null) }
    if (-not $ar.AsyncWaitHandle.WaitOne(1000)) { continue }
    $c = $l.EndGetContext($ar); $ar = $null
    $path = $c.Request.Url.AbsolutePath
    if ($CsakKiszolgalo) { Write-Host ($c.Request.HttpMethod + ' ' + $path) }
    try {
      if ($c.Request.HttpMethod -eq 'POST' -and $path -eq '/log') {
        $reader = New-Object IO.StreamReader($c.Request.InputStream, [Text.Encoding]::UTF8)
        $line = $reader.ReadToEnd(); if ($Reszletes -or -not $line.StartsWith('indul: ')) { Write-Host ('        · ' + $line) -ForegroundColor DarkGray }
        $c.Response.StatusCode = 204
      } elseif ($c.Request.HttpMethod -eq 'POST' -and $path -eq '/results') {
        $reader = New-Object IO.StreamReader($c.Request.InputStream, [Text.Encoding]::UTF8)
        $posted = $reader.ReadToEnd() | ConvertFrom-Json
        if (-not $CsakKiszolgalo) { $results = @($posted); $got = $true }
        $c.Response.StatusCode = 204
      } else {
        $body = $null; $type = 'text/plain'
        if ($path -eq '/') { $body = [IO.File]::ReadAllBytes((Join-Path $root 'tests\runner.html')); $type = $types['.html'] }
        elseif ($path -eq '/app.html') { $body = [Text.Encoding]::UTF8.GetBytes($appHtml); $type = $types['.html'] }
        elseif ($path -eq '/firebase-config.js') { $body = [Text.Encoding]::UTF8.GetBytes($configStub); $type = $types['.js'] }
        else {
          $file = Join-Path $root ($path.TrimStart('/') -replace '/', '\')
          if ((Test-Path $file -PathType Leaf) -and ([IO.Path]::GetFullPath($file)).StartsWith($root)) {
            $body = [IO.File]::ReadAllBytes($file); $ext = [IO.Path]::GetExtension($file); if ($types[$ext]) { $type = $types[$ext] }
          }
        }
        if ($body) { $c.Response.ContentType = $type; $c.Response.OutputStream.Write($body, 0, $body.Length) } else { $c.Response.StatusCode = 404 }
      }
    } catch { try { $c.Response.StatusCode = 500 } catch {} }
    try { $c.Response.Close() } catch {}
  }
} finally {
  $l.Stop()
  if ($proc -and -not $proc.HasExited) { cmd /c "taskkill /PID $($proc.Id) /T /F >nul 2>nul" }
}

if (-not $got) { Write-Host "A tesztek $Idokorlat másodperc alatt sem fejeződtek be. Próbáld: .\tests\run-tests.ps1 -Lathato" -ForegroundColor Red; exit 2 }
if (-not $results.Count) { Write-Host 'Egy teszt sem illett a szűrőre.' -ForegroundColor Yellow; exit 2 }
$failed = @($results | Where-Object { -not $_.ok })
foreach ($r in $results) {
  if ($r.ok) { Write-Host ("  OK    {0}" -f $r.name) -ForegroundColor Green }
  else { Write-Host ("  HIBA  {0}" -f $r.name) -ForegroundColor Red; Write-Host ("        {0}" -f $r.error) -ForegroundColor Red }
}
$passed = @($results).Count - $failed.Count
if ($failed.Count) { Write-Host "`n$passed sikeres, $($failed.Count) hibás teszt." -ForegroundColor Red; exit 1 }
Write-Host "`nMind a $passed teszt sikeres." -ForegroundColor Green
exit 0
