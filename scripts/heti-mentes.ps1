# Heti helyi mentés a Claude indulásakor.
# Claude Code SessionStart hookként fut: minden új munkamenet indulásakor megnézi, hány napos a legfrissebb mentés.
# Ha legalább $Napok napos (vagy még nincs), a háttérben elindítja az export-firestore.ps1-et, és csak az utolsó
# $Megtart mentést tartja meg. A Claude indulását nem lassítja: a mentés külön, rejtett ablakban fut.
#
# Telepítés (egyszer, a projektmappából):   .\scripts\heti-mentes.ps1 -Telepites
#   Beírja a hookot a %USERPROFILE%\.claude\settings.json fájlba (előtte másolatot készít: settings.json.bak).
# Kézi ellenőrzés:                           .\scripts\heti-mentes.ps1 -Allapot
# Eltávolítás: a settings.json "SessionStart" részéből töröld a heti-mentes.ps1-et tartalmazó bejegyzést.
#
# Napló: <mentések mappája>\heti-mentes.log. Ha az előző próbálkozás nem sikerült, a hook egy rövid figyelmeztetést ír ki,
# amit a Claude a munkamenet elején lát és jelezhet. Sikertelen próbálkozás után legfeljebb 6 óránként próbálja újra.
param(
  [string]$Cel = (Join-Path $env:USERPROFILE '.momassistant\mentesek'),
  [int]$Napok = 7,
  [int]$Megtart = 2,
  [switch]$Telepites,
  [switch]$Allapot,
  [switch]$Hatter
)

$naplo = Join-Path $Cel 'heti-mentes.log'
$allapotFajl = Join-Path $Cel 'heti-mentes.allapot'
$export = Join-Path $PSScriptRoot 'export-firestore.ps1'

function Get-LegfrissebbMentes {
  if (-not (Test-Path $Cel)) { return $null }
  $m = Get-ChildItem -Path $Cel -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{4}$' } | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $m) { return $null }
  return [datetime]::ParseExact($m.Name, 'yyyy-MM-dd_HHmm', [Globalization.CultureInfo]::InvariantCulture)
}

function Get-UtolsoProbalkozas {
  # Két sor: időpont (ISO) és kilépési kód
  if (-not (Test-Path $allapotFajl)) { return $null }
  $s = @(Get-Content -Path $allapotFajl -ErrorAction SilentlyContinue)
  if ($s.Count -lt 2) { return $null }
  try { return [pscustomobject]@{ Ido = [datetime]::Parse($s[0], [Globalization.CultureInfo]::InvariantCulture); Kod = [int]$s[1] } } catch { return $null }
}

# ---------- Telepítés: hook a felhasználói Claude-beállításokba ----------
if ($Telepites) {
  $ErrorActionPreference = 'Stop'
  $mappa = Join-Path $env:USERPROFILE '.claude'
  $fajl = Join-Path $mappa 'settings.json'
  $sajat = $PSCommandPath -replace '\\', '/'
  $parancs = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$sajat`""

  if (Test-Path $fajl) {
    $szoveg = [IO.File]::ReadAllText($fajl)
    if ($szoveg -match 'heti-mentes\.ps1') { Write-Output 'Már telepítve van, nincs teendő.'; exit 0 }
    $beall = if ($szoveg.Trim()) { $szoveg | ConvertFrom-Json } else { New-Object psobject }
    Copy-Item $fajl "$fajl.bak" -Force
  } else {
    New-Item -ItemType Directory -Force -Path $mappa | Out-Null
    $beall = New-Object psobject
  }

  if (-not ($beall.PSObject.Properties.Name -contains 'hooks')) { $beall | Add-Member -NotePropertyName hooks -NotePropertyValue (New-Object psobject) }
  $uj = [pscustomobject]@{ matcher = 'startup'; hooks = @([pscustomobject]@{ type = 'command'; command = $parancs; timeout = 30 }) }
  if ($beall.hooks.PSObject.Properties.Name -contains 'SessionStart') { $beall.hooks.SessionStart = @($beall.hooks.SessionStart) + $uj }
  else { $beall.hooks | Add-Member -NotePropertyName SessionStart -NotePropertyValue @($uj) }

  # Windows PowerShell 5.1: e nélkül a tömbök néha {"value":[...],"Count":n} alakban íródnának ki
  Remove-TypeData System.Array -ErrorAction SilentlyContinue
  [IO.File]::WriteAllText($fajl, ($beall | ConvertTo-Json -Depth 50), (New-Object Text.UTF8Encoding($false)))
  Write-Output "Kész: a hook bekerült ide: $fajl"
  if (Test-Path "$fajl.bak") { Write-Output "Az eredeti beállítások másolata: $fajl.bak" }
  Write-Output 'A következő Claude-munkamenet indulásakor már fut. Állapot: .\scripts\heti-mentes.ps1 -Allapot'
  exit 0
}

# ---------- Állapot kiírása kézi ellenőrzéshez ----------
if ($Allapot) {
  $l = Get-LegfrissebbMentes
  $p = Get-UtolsoProbalkozas
  Write-Output ('Legfrissebb mentés:      ' + $(if ($l) { $l.ToString('yyyy-MM-dd HH:mm') } else { 'nincs' }))
  Write-Output ('Utolsó próbálkozás:      ' + $(if ($p) { $p.Ido.ToString('yyyy-MM-dd HH:mm') + ', kód ' + $p.Kod + $(if ($p.Kod -eq 0) { ' (sikeres)' } else { ' (HIBA)' }) } else { 'még nem volt' }))
  if ($l) { Write-Output ('Következő mentés:        ' + $l.AddDays($Napok).ToString('yyyy-MM-dd') + ' után, az első Claude-indításkor') }
  Write-Output "Napló:                   $naplo"
  exit 0
}

# ---------- Háttérfolyamat: maga a mentés ----------
if ($Hatter) {
  New-Item -ItemType Directory -Force -Path $Cel | Out-Null
  # Zár: ha két munkamenet egyszerre indul, csak az egyik ment. A zárat a Windows a folyamat végén magától feloldja.
  try { $zar = [IO.File]::Open((Join-Path $Cel 'heti-mentes.zar'), 'OpenOrCreate', 'ReadWrite', 'None') } catch { exit 0 }
  try {
    $kezdet = Get-Date
    $kimenet = & $export -Cel $Cel -Megtart $Megtart 2>&1
    $kod = $LASTEXITCODE
    if ($null -eq $kod) { $kod = 4 }
  } catch { $kimenet = @("HIBA: $($_.Exception.Message)"); $kod = 4 }

  $sorok = @("=== $($kezdet.ToString('yyyy-MM-dd HH:mm:ss')) mentés (kód $kod) ===") + @($kimenet | ForEach-Object { "$_" })
  $regi = if (Test-Path $naplo) { @(Get-Content -Path $naplo -Encoding UTF8) } else { @() }
  $osszes = @($regi + $sorok) | Select-Object -Last 300
  [IO.File]::WriteAllLines($naplo, [string[]]$osszes, (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllLines($allapotFajl, [string[]]@($kezdet.ToString('s'), "$kod"), (New-Object Text.UTF8Encoding($false)))
  $zar.Close()
  exit $kod
}

# ---------- Hook mód: gyors döntés, a mentés a háttérben fut ----------
$legfrissebb = Get-LegfrissebbMentes
if ($legfrissebb -and $legfrissebb -gt (Get-Date).AddDays(-$Napok)) { exit 0 }

$utolso = Get-UtolsoProbalkozas
if ($utolso -and $utolso.Kod -ne 0) {
  Write-Output ("MomAssistant heti mentés: a legutóbbi próbálkozás nem sikerült ({0}, kód {1}). Részletek: {2}" -f $utolso.Ido.ToString('yyyy-MM-dd HH:mm'), $utolso.Kod, $naplo)
  if ($utolso.Ido -gt (Get-Date).AddHours(-6)) { exit 0 }
}

Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Hatter -Cel `"$Cel`" -Napok $Napok -Megtart $Megtart"
exit 0
