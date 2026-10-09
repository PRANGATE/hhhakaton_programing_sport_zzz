# scripts/reset-db.ps1
#
# Жёсткий сброс локального Postgres-стека.
# Все docker-вызовы обёрнуты в ErrorActionPreference='Continue',
# потому что docker пишет в stderr даже нормальные сообщения,
# а PS 5.1 + Stop падает на них.

[CmdletBinding()]
param(
  [string]$ProjectPath,
  [string[]]$ExtraContainers = @('fsp-app','fsp-migrate','fsp-postgres','fsp-ollama-tunnel'),
  [string[]]$ExtraVolumes    = @('hhru_pgdata','fsp_pgdata')
)

$ErrorActionPreference = "Stop"

# ---------- корень проекта ----------
if (-not $ProjectPath) {
  $here = $null
  if ($PSScriptRoot) {
    $here = $PSScriptRoot
  } elseif ($MyInvocation.MyCommand.Path) {
    $here = Split-Path -Parent $MyInvocation.MyCommand.Path
  }

  $candidates = @()
  if ($here) {
    $candidates += (Join-Path $here '..')
    $candidates += $here
  }
  $candidates += (Get-Location).Path

  foreach ($c in $candidates) {
    try {
      $full = (Resolve-Path -LiteralPath $c).Path
      if (Test-Path -LiteralPath (Join-Path $full 'docker-compose.yml')) {
        $ProjectPath = $full
        break
      }
    } catch { }
  }

  if (-not $ProjectPath) {
    throw "Не удалось найти docker-compose.yml. Запусти с -ProjectPath 'F:\hhru'."
  }
}

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK: $m"  -ForegroundColor Green }
function Warn($m) { Write-Host "!! $m"   -ForegroundColor Yellow }

# Обёртка для docker: глотает stderr, возвращает exit code.
function Invoke-Docker {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & docker @Args 2>&1 | Out-Null
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
}

Set-Location $ProjectPath

if (-not (Test-Path -LiteralPath ".\.env")) {
  throw "Нет .env в $ProjectPath. Сначала: .\scripts\gen-env.ps1"
}
if (-not (Test-Path -LiteralPath ".\docker-compose.yml")) {
  throw "Нет docker-compose.yml в $ProjectPath"
}

# ---------- 1. compose down ----------
Info "docker compose down -v --remove-orphans"
$code = Invoke-Docker compose down -v --remove-orphans
if ($code -ne 0) {
  Warn "docker compose down вернул код $code — продолжаю"
}

# ---------- 2. добить контейнеры вне compose ----------
Info "Удаляю контейнеры, которые могли остаться от прошлых docker run"
foreach ($name in $ExtraContainers) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    $exists = (& docker ps -a --filter "name=^/${name}$" --format '{{.Names}}' 2>$null) -join ''
  } finally { $ErrorActionPreference = $prev }

  if ($exists) {
    Write-Host "  - rm $name" -ForegroundColor DarkGray
    [void](Invoke-Docker rm -f $name)
  }
}

Info "Удаляю осиротевшие volume-ы"
foreach ($vol in $ExtraVolumes) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    $exists = (& docker volume ls --filter "name=^${vol}$" --format '{{.Name}}' 2>$null) -join ''
  } finally { $ErrorActionPreference = $prev }

  if ($exists) {
    Write-Host "  - volume rm $vol" -ForegroundColor DarkGray
    [void](Invoke-Docker volume rm $vol)
  }
}

# ---------- 3. поднять заново ----------
Info "docker compose up -d --build"

$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  & docker compose up -d --build 2>&1 | ForEach-Object {
    Write-Host $_ -ForegroundColor DarkGray
  }
  $upCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $prev
}

if ($upCode -ne 0) {
  Warn "docker compose up вернул код $upCode"
}

# ---------- 4. дождаться migrate ----------
Info "Жду migrate (максимум 60 секунд)"
$deadline  = (Get-Date).AddSeconds(60)
$migrateOk = $false

while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2

  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    $state = (& docker inspect fsp-migrate --format '{{.State.Status}}|{{.State.ExitCode}}' 2>$null) -join ''
  } finally { $ErrorActionPreference = $prev }

  if (-not $state) { continue }

  $parts = $state -split '\|'
  if ($parts[0] -eq 'exited') {
    if ($parts[1] -eq '0') { $migrateOk = $true; break }
    else {
      Warn "migrate завершился с кодом $($parts[1]) — логи:"
      [void](Invoke-Docker compose logs --tail=100 migrate)
      throw "миграции упали"
    }
  }
}

if (-not $migrateOk) {
  Warn "migrate не завершился за 60 секунд — логи:"
  [void](Invoke-Docker compose logs --tail=100 migrate)
  throw "таймаут ожидания migrate"
}
Ok "миграции применились"

# ---------- 5. статус ----------
Info "Статус контейнеров"
[void](Invoke-Docker compose ps)

Write-Host ""
Ok "Готово. Проверь:"
Write-Host "   curl http://localhost/health"           -ForegroundColor DarkGray
Write-Host "   curl http://localhost/ready"            -ForegroundColor DarkGray
Write-Host "   curl http://localhost/api/v1/ai/health" -ForegroundColor DarkGray