# scripts/start-tunnel.ps1
# Запускает клиент туннеля на домашнем ПК.
# TUNNEL_SECRET берётся из .deploy-secrets.json или .env (что найдётся).
# VpsHost по умолчанию 127.0.0.1 (локальный docker compose),
# для прода — передай -VpsHost 31.185.105.155.

[CmdletBinding()]
param(
  [string]$ProjectPath,
  [string]$VpsHost,
  [int]   $VpsPort  = 4010,
  [string]$LlmModel = "llama3.1:8b"
)

$ErrorActionPreference = "Stop"

# ---------- 1. Корень проекта ----------
# $PSScriptRoot и $MyInvocation.MyCommand.Path в PS 5.1 при -File могут быть
# пустыми. $PSCommandPath — надёжнее.

if (-not $ProjectPath) {
  $scriptPath = $PSCommandPath
  if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }
  if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Definition }

  $here = $null
  if ($scriptPath) { $here = Split-Path -Parent $scriptPath }

  $candidates = @()
  if ($here) {
    $candidates += (Join-Path $here '..')   # <root>\scripts\..  → <root>
    $candidates += $here                    # скрипт в корне
  }
  $candidates += (Get-Location).Path        # cwd

  foreach ($c in $candidates) {
    try {
      $full = (Resolve-Path -LiteralPath $c -ErrorAction Stop).Path
      # ищем любой из двух маркеров корня
      if ((Test-Path -LiteralPath (Join-Path $full 'docker-compose.yml')) -or
          (Test-Path -LiteralPath (Join-Path $full '.deploy-secrets.json')) -or
          (Test-Path -LiteralPath (Join-Path $full '.env'))) {
        $ProjectPath = $full
        break
      }
    } catch { }
  }

  if (-not $ProjectPath) {
    throw "Не нашёл корень проекта. Запусти с -ProjectPath 'F:\hhru'."
  }
}

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK: $m"  -ForegroundColor Green }
function Warn($m) { Write-Host "!! $m"   -ForegroundColor Yellow }

Info "Корень проекта: $ProjectPath"

# ---------- 2. TUNNEL_SECRET: .deploy-secrets.json → .env ----------

$secretsFile = Join-Path $ProjectPath ".deploy-secrets.json"
$envFile     = Join-Path $ProjectPath ".env"

$tunnelSecret = $null
$secretSource = $null

if (Test-Path -LiteralPath $secretsFile) {
  try {
    $s = Get-Content -LiteralPath $secretsFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($s.TUNNEL_SECRET) {
      $tunnelSecret = $s.TUNNEL_SECRET
      $secretSource = ".deploy-secrets.json"
    }
  } catch {
    Warn "Не удалось разобрать ${secretsFile}: $($_.Exception.Message)"
  }
}

if (-not $tunnelSecret -and (Test-Path -LiteralPath $envFile)) {
  $line = Select-String -LiteralPath $envFile -Pattern '^\s*TUNNEL_SECRET\s*=\s*(.+)$' -ErrorAction SilentlyContinue |
          Select-Object -First 1
  if ($line) {
    $tunnelSecret = $line.Matches.Groups[1].Value.Trim().Trim('"').Trim("'")
    $secretSource = ".env"
  }
}

if (-not $tunnelSecret) {
  throw "Не нашёл TUNNEL_SECRET ни в ${secretsFile}, ни в ${envFile}. Запусти .\scripts\gen-env.ps1 или .\deploy.ps1 -RotateSecrets."
}

Ok "TUNNEL_SECRET взят из $secretSource"

# ---------- 3. VpsHost: локальный compose → 127.0.0.1 ----------

if (-not $VpsHost) {
  $localTunnelUp = $false
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    $out = (& docker ps --filter "name=^/fsp-ollama-tunnel$" --format '{{.Names}}' 2>$null) -join ''
    $localTunnelUp = [bool]$out
  } finally { $ErrorActionPreference = $prev }

  if ($localTunnelUp) {
    $VpsHost = '127.0.0.1'
    Ok "Контейнер fsp-ollama-tunnel найден локально — VpsHost=127.0.0.1"
  } else {
    $VpsHost = '31.185.105.155'
    Info "Локального туннеля нет — VpsHost=31.185.105.155 (прод)"
  }
}

# ---------- 4. Проверки инструментов ----------

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "node не найден в PATH. Установи Node.js ≥ 20."
}
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Warn "ollama не найдена в PATH. Если она запущена как служба — клиент сможет до неё достучаться по HTTP."
}

# ---------- 5. Ollama ----------

$ollamaOk = $false
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3 -UseBasicParsing
  $ollamaOk = ($r.StatusCode -eq 200)
} catch { $ollamaOk = $false }

if ($ollamaOk) {
  Ok "Ollama отвечает на 127.0.0.1:11434"
} else {
  Warn "Ollama не отвечает на 127.0.0.1:11434."
  Warn "Запусти 'ollama serve' в отдельном окне, иначе health будет false."
}

# ---------- 6. Запуск ----------

$env:VPS_TUNNEL_URL = "ws://${VpsHost}:${VpsPort}/ollama-tunnel"
$env:TUNNEL_SECRET  = $tunnelSecret
$env:LLM_MODEL      = $LlmModel

Write-Host ""
Info "VPS_TUNNEL_URL = $env:VPS_TUNNEL_URL"
Info "LLM_MODEL      = $env:LLM_MODEL"
Info "Запускаю tunnel/client.js…"
Ok  "Оставь это окно открытым. Ctrl+C — остановить."
Write-Host ""

$clientPath = Join-Path $ProjectPath "tunnel\client.js"
if (-not (Test-Path -LiteralPath $clientPath)) {
  throw "Не нашёл $clientPath"
}

node $clientPath