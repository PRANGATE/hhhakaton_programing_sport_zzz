# scripts/gen-env.ps1
#
# Генерирует .env из .env.example, подставляя реальные секреты вместо
# плейсхолдеров (change_me_*, fsp_secret, dev_*).
#
# Источник секретов:
#   • .deploy-secrets.json (если есть и не задан -NoDeploySecrets)
#   • иначе — генерируются заново
#
# Режимы:
#   (без флагов)  создать .env, если его нет. Если есть — отказаться.
#   -Force        перезаписать .env из шаблона (правки в существующем .env теряются).
#   -Rotate       перегенерировать секреты и обновить ТОЛЬКО их в существующем .env,
#                 остальные строки сохранить. Если .env нет — создать.
#   -Merge        создать .env, если нет; если есть — дописать только отсутствующие
#                 ключи, не трогая существующие значения.
#
# Примеры:
#   powershell -File .\scripts\gen-env.ps1
#   powershell -File .\scripts\gen-env.ps1 -Force
#   powershell -File .\scripts\gen-env.ps1 -Rotate
#   powershell -File .\scripts\gen-env.ps1 -ProjectPath "F:\hhru"

[CmdletBinding()]
param(
  [string]$ProjectPath,
  [string]$TemplatePath,
  [string]$OutputPath,
  [switch]$Force,
  [switch]$Rotate,
  [switch]$Merge,
  [switch]$NoDeploySecrets
)

$ErrorActionPreference = "Stop"

# ---------- определяем корень проекта ----------
# $PSScriptRoot в param-default не всегда доступен (PS 5.1 + -File),
# поэтому резолвим здесь, а не в значении параметра.

if (-not $ProjectPath) {
  $here = $null
  if ($PSScriptRoot) {
    $here = $PSScriptRoot
  } elseif ($MyInvocation.MyCommand.Path) {
    $here = Split-Path -Parent $MyInvocation.MyCommand.Path
  }

  $candidates = @()
  if ($here) {
    $candidates += (Join-Path $here '..')   # <root>\scripts\..  → <root>
    $candidates += $here                    # скрипт в самом корне
  }
  $candidates += (Get-Location).Path        # cwd как последний шанс

  foreach ($c in $candidates) {
    try {
      $full = (Resolve-Path -LiteralPath $c).Path
      if (Test-Path -LiteralPath (Join-Path $full '.env.example')) {
        $ProjectPath = $full
        break
      }
    } catch { }
  }

  if (-not $ProjectPath) {
    throw "Не удалось найти .env.example. Запусти с -ProjectPath 'F:\hhru'."
  }
}

if (-not $TemplatePath) { $TemplatePath = Join-Path $ProjectPath ".env.example" }
if (-not $OutputPath)   { $OutputPath   = Join-Path $ProjectPath ".env" }

$SecretsFile = Join-Path $ProjectPath ".deploy-secrets.json"

# ---------- утилиты ----------

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK: $m"  -ForegroundColor Green }
function Warn($m) { Write-Host "!! $m"   -ForegroundColor Yellow }

# Криптостойкий генератор: RNGCryptoServiceProvider + алфавит
# A-Z a-z 0-9 - _ (без символов, которые ломают URL/JSON/ENV).
function New-Secret([int]$len = 48) {
  $alphabet = (48..57) + (65..90) + (97..122) + @(45, 95)   # 0-9 A-Z a-z - _
  $bytes = New-Object byte[] $len

  # Работает и в PS 5.1 (.NET Framework), и в PS 7+ (.NET 6+).
  # Класс находится в System.Security.Cryptography, не в System.
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }

  -join ($bytes | ForEach-Object { [char]$alphabet[$_ % $alphabet.Length] })
}

# Запись без BOM — важно: docker compose и dotenv плохо едят BOM.
function Write-NoBom([string]$path, [string]$text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $text, $enc)
}

# ---------- что генерируем ----------
# Ключ → длина. Значения либо берём из .deploy-secrets.json, либо генерируем.

$need = [ordered]@{
  POSTGRES_PASSWORD  = 40
  JWT_ACCESS_SECRET  = 48
  JWT_REFRESH_SECRET = 48
  TUNNEL_SECRET      = 48
}

# ---------- проверки ----------

if (-not (Test-Path -LiteralPath $TemplatePath)) {
  throw "Не найден шаблон: ${TemplatePath}"
}

$fileExists = Test-Path -LiteralPath $OutputPath

if ($fileExists -and -not ($Force -or $Rotate -or $Merge)) {
  Warn "$OutputPath уже существует."
  Write-Host "   Используй один из флагов:"                              -ForegroundColor Yellow
  Write-Host "     -Force    перезаписать из шаблона (правки теряются)"  -ForegroundColor Yellow
  Write-Host "     -Rotate   перегенерировать только секреты"            -ForegroundColor Yellow
  Write-Host "     -Merge    дописать только недостающие ключи"          -ForegroundColor Yellow
  exit 0
}

# ---------- 1. собираем секреты ----------

$secrets = $null
if (-not $NoDeploySecrets -and (Test-Path -LiteralPath $SecretsFile)) {
  Info "Читаю $SecretsFile"
  try {
    $secrets = Get-Content -LiteralPath $SecretsFile -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    Warn "Не удалось разобрать ${SecretsFile}: $($_.Exception.Message)"
    $secrets = $null
  }
}

$values = @{}
$source = @{}

foreach ($k in $need.Keys) {
  $len = $need[$k]
  if ($secrets -and $secrets.$k) {
    $values[$k] = $secrets.$k
    $source[$k] = 'deploy-secrets'
  } else {
    $values[$k] = New-Secret $len
    $source[$k] = 'generated'
  }
}

# --- синхронизация TUNNEL_SECRET обратно в .deploy-secrets.json ---
# Если в .env он есть, а в .deploy-secrets.json отсутствует — дописываем.
$secFile = Join-Path $ProjectPath ".deploy-secrets.json"
if ((Test-Path -LiteralPath $secFile) -and -not $NoDeploySecrets) {
  try {
    $existing = Get-Content -LiteralPath $secFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $existing.TUNNEL_SECRET) {
      $existing | Add-Member -NotePropertyName TUNNEL_SECRET -NotePropertyValue $values.TUNNEL_SECRET -Force
      ($existing | ConvertTo-Json) | Set-Content -LiteralPath $secFile -Encoding UTF8
      Ok "TUNNEL_SECRET дописан в .deploy-secrets.json"
    }
  } catch {
    Warn "Не удалось синхронизировать TUNNEL_SECRET в .deploy-secrets.json: $($_.Exception.Message)"
  }
}

# ---------- 2. читаем шаблон ----------

Info "Шаблон: $TemplatePath"
$template = Get-Content -LiteralPath $TemplatePath -Raw -Encoding UTF8
$lines = $template -split "`r?`n"

# ---------- 3. подстановка ----------

$out      = New-Object System.Collections.Generic.List[string]
$seenKeys = @{}
$replaced = @{}

# Плейсхолдеры, которые обязаны исчезнуть. Если что-то осталось — предупредим.
$placeholderPatterns = @(
  'change_me_access_secret_min_32_chars',
  'change_me_refresh_secret_min_32_chars',
  'change_me_tunnel_secret',
  'change_me',
  'fsp_secret',
  'dev_access_change_me_min_32_chars_ok_12345',
  'dev_refresh_change_me_min_32_chars_ok_12345'
)

foreach ($line in $lines) {
  $trim = $line.Trim()

  # Пустые и комментарии — как есть.
  if ($trim -eq '' -or $trim.StartsWith('#')) {
    $out.Add($line); continue
  }

  # Не ENTITY=VALUE — оставляем (заголовки секций, мусор).
  if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $out.Add($line); continue
  }

  $key = $Matches[1]
  $val = $Matches[2]
  $seenKeys[$key] = $true

  switch ($key) {

    'POSTGRES_PASSWORD' {
      $out.Add("$key=$($values.POSTGRES_PASSWORD)")
      $replaced[$key] = $true
    }

    'JWT_ACCESS_SECRET' {
      $out.Add("$key=$($values.JWT_ACCESS_SECRET)")
      $replaced[$key] = $true
    }

    'JWT_REFRESH_SECRET' {
      $out.Add("$key=$($values.JWT_REFRESH_SECRET)")
      $replaced[$key] = $true
    }

    'TUNNEL_SECRET' {
      $out.Add("$key=$($values.TUNNEL_SECRET)")
      $replaced[$key] = $true
    }

    'DATABASE_URL' {
      # postgres://user:pass@host:port/db → подменить только pass
      $newVal = $val -replace `
        '(postgres(?:ql)?://[^:@/]+:)[^@]+(@)',
        "`${1}$($values.POSTGRES_PASSWORD)`${2}"
      $out.Add("$key=$newVal")
      $replaced[$key] = $true
    }

    default {
      $out.Add($line)
    }
  }
}

# ---------- 4. добавляем недостающие ключи ----------

$missing = @()
foreach ($k in $need.Keys) {
  if (-not $seenKeys[$k]) {
    $missing += $k
  }
}

if ($missing.Count) {
  if ($out.Count -and $out[$out.Count - 1] -ne '') { $out.Add('') }
  $out.Add('# ---------- добавлено gen-env.ps1 ----------')
  foreach ($k in $missing) {
    $out.Add("$k=$($values[$k])")
    $replaced[$k] = $true
  }
}

# ---------- 5. режим -Rotate: правка существующего .env ----------

if ($Rotate -and $fileExists) {
  Info "Rotate: обновляю только секретные ключи в существующем $OutputPath"

  $existing = Get-Content -LiteralPath $OutputPath -Raw -Encoding UTF8
  $exLines  = $existing -split "`r?`n"
  $newLines = New-Object System.Collections.Generic.List[string]
  $patched  = @{}

  foreach ($line in $exLines) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $k = $Matches[1]
      switch ($k) {
        'POSTGRES_PASSWORD'  { $newLines.Add("$k=$($values.POSTGRES_PASSWORD)");  $patched[$k]=$true; continue }
        'JWT_ACCESS_SECRET'  { $newLines.Add("$k=$($values.JWT_ACCESS_SECRET)");  $patched[$k]=$true; continue }
        'JWT_REFRESH_SECRET' { $newLines.Add("$k=$($values.JWT_REFRESH_SECRET)"); $patched[$k]=$true; continue }
        'TUNNEL_SECRET'      { $newLines.Add("$k=$($values.TUNNEL_SECRET)");      $patched[$k]=$true; continue }
        'DATABASE_URL' {
          $nv = $Matches[2] -replace `
            '(postgres(?:ql)?://[^:@/]+:)[^@]+(@)',
            "`${1}$($values.POSTGRES_PASSWORD)`${2}"
          $newLines.Add("$k=$nv")
          $patched[$k]=$true
          continue
        }
      }
    }
    $newLines.Add($line)
  }

  foreach ($k in $need.Keys) {
    if (-not $patched[$k]) {
      $newLines.Add("$k=$($values[$k])")
    }
  }

  $final = ($newLines -join "`r`n") + "`r`n"
  Write-NoBom $OutputPath $final

  Ok "$OutputPath обновлён (только секреты)"
  Write-Host ""
  foreach ($k in $need.Keys) {
    Write-Host ("  {0,-20}  [{1}]" -f $k, $source[$k]) -ForegroundColor DarkGray
  }
  exit 0
}

# ---------- 6. режим -Merge: дописать отсутствующие ключи ----------

if ($Merge -and $fileExists) {
  Info "Merge: дописываю отсутствующие ключи, существующие не трогаю"

  $existing = Get-Content -LiteralPath $OutputPath -Raw -Encoding UTF8
  $exLines  = $existing -split "`r?`n"
  $exKeys   = @{}
  foreach ($line in $exLines) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
      $exKeys[$Matches[1]] = $true
    }
  }

  $add = New-Object System.Collections.Generic.List[string]
  foreach ($k in $need.Keys) {
    if (-not $exKeys[$k]) {
      $add.Add("$k=$($values[$k])")
    }
  }

  if (-not $add.Count) {
    Ok "Нечего добавлять — все ключи уже есть."
    exit 0
  }

  $final = $existing.TrimEnd() + "`r`n`r`n# ---------- добавлено gen-env.ps1 (merge) ----------`r`n"
  $final += ($add -join "`r`n") + "`r`n"

  Write-NoBom $OutputPath $final
  Ok "$OutputPath дополнен"
  foreach ($line in $add) { Write-Host "  + $line" -ForegroundColor DarkGray }
  exit 0
}

# ---------- 7. обычный режим: создать/перезаписать .env ----------

$final = ($out -join "`r`n") + "`r`n"
Write-NoBom $OutputPath $final
Ok "$OutputPath создан из шаблона"

# ---------- 8. проверка на остатки плейсхолдеров ----------

$leftovers = @()
foreach ($p in $placeholderPatterns) {
  $hits = Select-String -LiteralPath $OutputPath -Pattern ([regex]::Escape($p)) -SimpleMatch -ErrorAction SilentlyContinue
  if ($hits) { $leftovers += $p }
}
if ($leftovers.Count) {
  Warn "В $OutputPath остались плейсхолдеры: $($leftovers -join ', ')"
  Warn "Проверь вручную."
}

# ---------- 9. сводка ----------

Write-Host ""
Write-Host "Сгенерировано:" -ForegroundColor Cyan
foreach ($k in $need.Keys) {
  $v = $values[$k]
  $shown = $v.Substring(0, [Math]::Min(8, $v.Length)) + '…'
  Write-Host ("  {0,-20}  {1,-16}  [{2}]" -f $k, $shown, $source[$k]) -ForegroundColor DarkGray
}

Write-Host ""
Ok "Готово. Файл: $OutputPath"
Write-Host "   .env уже в .gitignore — в репозиторий не попадёт." -ForegroundColor DarkGray