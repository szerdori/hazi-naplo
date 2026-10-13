# Feltölti (commit + push) a változásokat a GitHubra; a GitHub Pages 1-2 percen belül kiteszi az új verziót.
# Használat:  .\feltoltes.ps1 "Mit változtattunk"
# Üzenet nélkül indítva rákérdez.
# Feltöltés előtt lefuttatja a regressziós teszteket (tests\run-tests.ps1); ha valamelyik hibás, nem tölt fel.
# Tesztek nélkül (csak indokolt esetben):  .\feltoltes.ps1 "Mit változtattunk" -TesztNelkul
param([string]$Uzenet, [switch]$TesztNelkul)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$git = 'C:\Program Files\Git\cmd\git.exe'
if (-not (Test-Path $git)) { $git = 'git' }

$valtozasok = & $git status --porcelain
if (-not $valtozasok) {
  Write-Host 'Nincs feltöltendő változás.' -ForegroundColor Yellow
  exit 0
}

Write-Host 'Ezek a fájlok változtak:' -ForegroundColor Cyan
& $git status --short

if (-not $TesztNelkul) {
  Write-Host 'Regressziós tesztek futnak...' -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'tests\run-tests.ps1')
  if ($LASTEXITCODE -ne 0) { Write-Host 'A tesztek nem mentek át, ezért nem töltöm fel. Javítsd a hibát, vagy ha biztos vagy benne: -TesztNelkul' -ForegroundColor Red; exit 1 }
}

if (-not $Uzenet) { $Uzenet = Read-Host 'Röviden: mit változtattunk? (Enter = "Frissítés")' }
if (-not $Uzenet) { $Uzenet = 'Frissítés' }

& $git add -A
& $git commit -q -m $Uzenet
if ($LASTEXITCODE -ne 0) { Write-Host 'A commit nem sikerült.' -ForegroundColor Red; exit 1 }
& $git push
if ($LASTEXITCODE -ne 0) { Write-Host 'A feltöltés nem sikerült. A változás helyben el van mentve, később újrapróbálható.' -ForegroundColor Red; exit 1 }

Write-Host 'Kész. 1-2 perc múlva él: https://szerdori.github.io/hazi-naplo/' -ForegroundColor Green
