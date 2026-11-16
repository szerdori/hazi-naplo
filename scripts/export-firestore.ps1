# Helyi mentés: a MomAssistant Firestore-adatbázisának minden gyűjteményét JSON-fájlba menti.
# A mentés a gépeden marad (alapból: %USERPROFILE%\.momassistant\mentesek\<dátum>\), a nyilvános tárolóba soha ne kerüljön:
# családi adatokat tartalmaz. (GitHub Actions artifactba sem szabad tölteni, mert a nyilvános tárolónál az is elérhető.)
# A kulcsot a gépen tárolt fájlból olvassa (alapból: %USERPROFILE%\.momassistant\kulcs.json), és soha nem írja ki. Csak olvas.
#
# Használat:  .\scripts\export-firestore.ps1            (mentés, a legutóbbi 12 mentést tartja meg)
#             .\scripts\export-firestore.ps1 -Megtart 30
# Ütemezés: a heti-mentes.ps1 hetente egyszer, a Claude indulásakor futtatja (-Megtart 2), lásd annak a leírását.
# Kilépési kód: 0 = kész, 2 = nincs kulcsfájl, 3 = a bejelentkezés nem sikerült, 4 = a mentés közben hiba történt.
# Korlát: csak a legfelső szintű gyűjteményeket menti (algyűjteményeket nem); az app ma nem használ ilyet.
param(
  [string]$KeyPath = (Join-Path $env:USERPROFILE '.momassistant\kulcs.json'),
  [string]$Project = 'hazi-naplo',
  [string]$Cel = (Join-Path $env:USERPROFILE '.momassistant\mentesek'),
  [int]$Megtart = 12
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

try { $headers = @{ Authorization = 'Bearer ' + (Get-AccessToken) } }
catch { Write-Output "HIBA: nem sikerült bejelentkezni a kulccsal ($($_.Exception.Message))"; exit 3 }

$base = "https://firestore.googleapis.com/v1/projects/$Project/databases/(default)/documents"
$mappa = Join-Path $Cel (Get-Date -Format 'yyyy-MM-dd_HHmm')
$ideiglenes = "$mappa.folyamatban"
New-Item -ItemType Directory -Force -Path $ideiglenes | Out-Null

try {
  $ids = @()
  $kerelem = @{ pageSize = 100 }
  do {
    $r = Invoke-RestMethod -Method Post -Uri "${base}:listCollectionIds" -Headers $headers -ContentType 'application/json' -Body ($kerelem | ConvertTo-Json -Compress)
    if ($r.collectionIds) { $ids += $r.collectionIds }
    $kerelem = @{ pageSize = 100; pageToken = $r.nextPageToken }
  } while ($r.nextPageToken)

  $osszes = 0
  foreach ($id in $ids) {
    $dokumentumok = @(); $token = $null
    do {
      $uri = "$base/${id}?pageSize=300" + $(if ($token) { '&pageToken=' + [Uri]::EscapeDataString($token) } else { '' })
      $p = Invoke-RestMethod -Uri $uri -Headers $headers
      if ($p.documents) { $dokumentumok += $p.documents }
      $token = $p.nextPageToken
    } while ($token)
    $json = @{ collection = $id; count = $dokumentumok.Count; documents = $dokumentumok } | ConvertTo-Json -Depth 30
    [IO.File]::WriteAllText((Join-Path $ideiglenes "$id.json"), $json, (New-Object Text.UTF8Encoding($false)))
    $osszes += $dokumentumok.Count
    Write-Output ("  {0}: {1} dokumentum" -f $id, $dokumentumok.Count)
  }
  if (-not $ids.Count) { throw 'Az adatbázisban nem találtam gyűjteményt, ez gyanús, ezért nem mentek.' }
  Rename-Item -Path $ideiglenes -NewName (Split-Path $mappa -Leaf)
  Write-Output "Kész: $($ids.Count) gyűjtemény, $osszes dokumentum -> $mappa"
}
catch {
  Remove-Item -Recurse -Force $ideiglenes -ErrorAction SilentlyContinue
  Write-Output "HIBA: a mentés nem sikerült ($($_.Exception.Message))"
  exit 4
}

# A régi mentések törlése: csak a befejezett mentésmappákat (dátumos nevűek) számoljuk
$mentesek = @(Get-ChildItem -Path $Cel -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{4}$' } | Sort-Object Name -Descending)
if ($mentesek.Count -gt $Megtart) { $mentesek | Select-Object -Skip $Megtart | ForEach-Object { Remove-Item -Recurse -Force $_.FullName } }
exit 0
