# Feltölti a napi Claude-átnézés javaslatait a MomAssistant adatbázisába (Firestore, suggestions gyűjtemény).
# A kulcsot a gépen tárolt fájlból olvassa (alapból: %USERPROFILE%\.momassistant\kulcs.json), és soha nem írja ki.
#
#   -Mode check   csak ellenőrzi, hogy a kulccsal be lehet-e jelentkezni
#   -Mode last    kiírja az előző sikeres feltöltés idejét (Unix másodperc), vagy azt, hogy "nincs"
#   -Mode upload  -File <javaslatok.json>  feltölti a javaslatokat, és elmenti a feltöltés idejét
#
# A javaslatok.json egy tömb: [{ "id", "title", "deadline" (YYYY-MM-DD vagy ""), "source", "note", "link", "for" }]
param(
  [ValidateSet('check', 'last', 'upload')][string]$Mode = 'check',
  [string]$File,
  [string]$KeyPath = (Join-Path $env:USERPROFILE '.momassistant\kulcs.json'),
  [string]$Project = 'hazi-naplo'
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not (Test-Path $KeyPath)) { Write-Output "HIBA: nincs kulcsfájl itt: $KeyPath"; exit 2 }

function B64Url([byte[]]$bytes) { [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_') }

function Get-AccessToken {
  $k = [IO.File]::ReadAllText($KeyPath) | ConvertFrom-Json
  $pem = $k.private_key -replace '-----BEGIN PRIVATE KEY-----', '' -replace '-----END PRIVATE KEY-----', '' -replace '\s', ''
  $cng = [Security.Cryptography.CngKey]::Import([Convert]::FromBase64String($pem), [Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
  $rsa = New-Object Security.Cryptography.RSACng($cng)
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $head = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"RS256","typ":"JWT"}'))
  $claims = [ordered]@{ iss = $k.client_email; scope = 'https://www.googleapis.com/auth/datastore'; aud = 'https://oauth2.googleapis.com/token'; iat = $now; exp = $now + 3600 }
  $body = B64Url ([Text.Encoding]::UTF8.GetBytes(($claims | ConvertTo-Json -Compress)))
  $sig = $rsa.SignData([Text.Encoding]::ASCII.GetBytes("$head.$body"), [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $res = Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:jwt-bearer'; assertion = "$head.$body.$(B64Url $sig)" }
  return $res.access_token
}

$base = "https://firestore.googleapis.com/v1/projects/$Project/databases/(default)/documents"
try { $headers = @{ Authorization = 'Bearer ' + (Get-AccessToken) } }
catch { Write-Output "HIBA: nem sikerült bejelentkezni a kulccsal ($($_.Exception.Message))"; exit 3 }

function Send-Json($method, $uri, $obj) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 10 -Compress))
  Invoke-RestMethod -Method $method -Uri $uri -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes
}
function Get-LastRun {
  try { $d = Invoke-RestMethod -Uri "$base/meta/javaslatok" -Headers $headers; return [long]$d.fields.lastRun.integerValue }
  catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { return $null } throw }
}

if ($Mode -eq 'check') { $null = Get-LastRun; Write-Output 'OK: a kulcs működik, az adatbázis elérhető.'; exit 0 }
if ($Mode -eq 'last') { $l = Get-LastRun; if ($l) { Write-Output $l } else { Write-Output 'nincs' }; exit 0 }

if (-not $File -or -not (Test-Path $File)) { Write-Output 'HIBA: add meg a javaslatok fájlját (-File).'; exit 4 }
# PS 5.1-ben a ConvertFrom-Json egyben adja vissza a tömböt, ezért szét kell bontani
$items = @(([IO.File]::ReadAllText($File, [Text.Encoding]::UTF8) | ConvertFrom-Json) | ForEach-Object { $_ })
$added = 0; $existing = 0; $failed = 0
$nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
foreach ($s in $items) {
  if (-not $s.id -or -not $s.title) { $failed++; continue }
  $id = ($s.id -replace '[^A-Za-z0-9_-]', '-'); if ($id.Length -gt 120) { $id = $id.Substring(0, 120) }
  $str = { param($v) @{ stringValue = [string]$(if ($null -eq $v) { '' } else { $v }) } }
  $doc = @{ fields = @{
    title = & $str $s.title; deadline = & $str $s.deadline; source = & $str $s.source; note = & $str $s.note
    link = & $str $s.link; for = & $str $s.for; status = @{ stringValue = 'new' }; announced = @{ booleanValue = $false }
    createdAt = @{ integerValue = [string]$nowMs }
  } }
  try { $null = Send-Json 'Post' "$base/suggestions?documentId=$id" $doc; $added++ }
  catch {
    # 409: már létezik (korábban felvéve, elvetve vagy még függőben) - nem írjuk felül
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409) { $existing++ } else { $failed++ }
  }
}
$null = Send-Json 'Patch' "$base/meta/javaslatok" @{ fields = @{ lastRun = @{ integerValue = [string][DateTimeOffset]::UtcNow.ToUnixTimeSeconds() } } }
Write-Output "Kész: $added új javaslat, $existing már korábban megvolt, $failed hibás."
