# deploy.ps1 - полный деплой с ПЕРЕСОЗДАНИЕМ БД.
# Дополнительно поднимает контейнер fsp-ollama-tunnel.

[CmdletBinding()]
param(
  [switch]$RotateSecrets
)

$ErrorActionPreference = "Stop"

# ======================= НАСТРОЙКИ =======================
$ProjectPath   = "F:\hhru"
$ImageName     = "fsp-hhru"
$ImageTag      = "latest"
$FullImage     = "${ImageName}:${ImageTag}"

$TunnelImage     = "fsp-ollama-tunnel:latest"
$TunnelDockerfile = "tunnel\Dockerfile"

$VpsUser       = "root"
$VpsHost       = "31.185.105.155"
$VpsDockerDir  = "/home/PRANG/docker"
$RemoteTar     = "$VpsDockerDir/fsp-hhru-image.tar"
$PgVolumePath  = "$VpsDockerDir/pgdata"

$ContainerName     = "fsp-app"
$ContainerMigrate  = "fsp-migrate"
$ContainerPostgres = "fsp-postgres"
$ContainerTunnel   = "fsp-ollama-tunnel"
$NetworkName       = "fsp-net"

$PortMapping        = "80:8080"
$TunnelPortMapping  = "4010:4010"
$MemoryLimit        = "320m"
$CpuLimit           = "0.5"

$PostgresUser  = "fsp"
$PostgresDb    = "fsp"

$SecretsFile   = Join-Path $ProjectPath ".deploy-secrets.json"
$LocalTar      = Join-Path $env:TEMP "fsp-hhru-image.tar"
# =========================================================

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK: $m"  -ForegroundColor Green }
function Warn($m) { Write-Host "!! $m"   -ForegroundColor Yellow }

function New-Secret([int]$len = 48) {
  $chars = (48..57) + (65..90) + (97..122) + @(45, 95)
  -join (1..$len | ForEach-Object { [char]($chars | Get-Random) })
}

function New-SecretsBlock {
  [ordered]@{
    POSTGRES_PASSWORD   = New-Secret 40
    JWT_ACCESS_SECRET   = New-Secret 48
    JWT_REFRESH_SECRET  = New-Secret 48
    TUNNEL_SECRET       = New-Secret 48
    generated_at        = (Get-Date).ToString("o")
  }
}

function Get-Secrets {
  if (-not (Test-Path $SecretsFile)) {
    Info "Секреты не найдены, генерирую новые"
    $s = New-SecretsBlock
    $s | ConvertTo-Json | Set-Content -Path $SecretsFile -Encoding UTF8
    Ok "Секреты сохранены в $SecretsFile (gitignored)"
    return $s
  }

  $secrets = Get-Content $SecretsFile -Raw | ConvertFrom-Json

  if ($RotateSecrets) {
    Warn "RotateSecrets: перегенерирую секреты. Все ранее выданные JWT станут невалидными."
    $confirm = Read-Host "Продолжить? (yes/no)"
    if ($confirm -ne "yes") { throw "Отменено пользователем" }
    $s = New-SecretsBlock
    $s | ConvertTo-Json | Set-Content -Path $SecretsFile -Encoding UTF8
    Ok "Секреты перегенерированы"
    return $s
  }

  # миграция: дописываем отсутствующие поля без сброса остального
  $changed = $false
  if (-not $secrets.TUNNEL_SECRET) {
    Warn "TUNNEL_SECRET отсутствует — генерирую и дописываю в $SecretsFile"
    $secrets | Add-Member -NotePropertyName TUNNEL_SECRET -NotePropertyValue (New-Secret 48) -Force
    $changed = $true
  }
  if ($changed) {
    $secrets | ConvertTo-Json | Set-Content -Path $SecretsFile -Encoding UTF8
  }

  Info "Секреты загружены из $SecretsFile (сгенерированы $($secrets.generated_at))"
  return $secrets
}

# --- проверки окружения ---
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker не найден. Запусти Docker Desktop."
}
if (-not (Test-Path (Join-Path $ProjectPath "Dockerfile"))) {
  throw "Dockerfile не найден в $ProjectPath"
}
if (-not (Test-Path (Join-Path $ProjectPath $TunnelDockerfile))) {
  throw "Не найден $TunnelDockerfile"
}

$sec = Get-Secrets
$PostgresPassword = $sec.POSTGRES_PASSWORD
$JwtAccessSecret  = $sec.JWT_ACCESS_SECRET
$JwtRefreshSecret = $sec.JWT_REFRESH_SECRET
$TunnelSecret     = $sec.TUNNEL_SECRET

$DatabaseUrl = "postgres://${PostgresUser}:${PostgresPassword}@${ContainerPostgres}:5432/${PostgresDb}"

$EnvVars = @(
  "NODE_ENV=production",
  "PORT=3000",
  "NODE_OPTIONS=--max-old-space-size=192",
  "DATABASE_URL=$DatabaseUrl",
  "JWT_ACCESS_SECRET=$JwtAccessSecret",
  "JWT_REFRESH_SECRET=$JwtRefreshSecret",
  "JWT_ACCESS_TTL=1h",
  "JWT_REFRESH_TTL=30d",
  "KEYCLOAK_ENABLED=false",
  "KEYCLOAK_URL=https://id.fsp.example",
  "KEYCLOAK_REALM=fsp",
  "KEYCLOAK_CLIENT_ID=fsp-web",

  # LLM: идём через HTTP-фасад туннеля
  "OLLAMA_URL=http://${ContainerTunnel}:11434",
  "LLM_MODE=hybrid",
  "LLM_PROVIDER=ollama",
  "LLM_MODEL=llama3.1:8b",
  "LLM_TIMEOUT_MS=60000"
)
$EnvArgs = ($EnvVars | ForEach-Object { "-e `"$_`"" }) -join " "

# --- 1. сборка обоих образов ---
Info "Сборка $FullImage"
docker build -t $FullImage $ProjectPath
if ($LASTEXITCODE -ne 0) { throw "docker build (app) упал" }
Ok "образ приложения собран"

Info "Сборка $TunnelImage"
docker build -f (Join-Path $ProjectPath $TunnelDockerfile) -t $TunnelImage $ProjectPath
if ($LASTEXITCODE -ne 0) { throw "docker build (tunnel) упал" }
Ok "образ туннеля собран"

# --- 2. save обоих образов ---
Info "docker save -> $LocalTar"
docker save -o $LocalTar $FullImage $TunnelImage
if ($LASTEXITCODE -ne 0) { throw "docker save упал" }
Ok ("tar: {0:N1} MB" -f ((Get-Item $LocalTar).Length / 1MB))

$sshTarget = "$VpsUser@$VpsHost"

# --- 3. mkdir + scp ---
Info "mkdir на VPS"
ssh $sshTarget "mkdir -p '$VpsDockerDir'"
if ($LASTEXITCODE -ne 0) { throw "ssh/mkdir упал" }

Info "scp -> $RemoteTar"
scp $LocalTar "${sshTarget}:$RemoteTar"
if ($LASTEXITCODE -ne 0) { throw "scp упал" }
Ok "доставлено"

# --- 4. сброс БД + туннель + миграции + перезапуск ---
Info "!! Полный сброс PostgreSQL и перезапуск стека"
$remoteLines = @(
  "set -e",
  "docker network inspect $NetworkName >/dev/null 2>&1 || docker network create $NetworkName",

  # PostgreSQL — сносим и поднимаем заново
  "docker stop $ContainerPostgres >/dev/null 2>&1 || true",
  "docker rm -f $ContainerPostgres >/dev/null 2>&1 || true",
  "rm -rf '$PgVolumePath'",
  "mkdir -p '$PgVolumePath'",
  "docker run -d --name $ContainerPostgres --network $NetworkName --restart unless-stopped -e POSTGRES_USER=$PostgresUser -e POSTGRES_PASSWORD=$PostgresPassword -e POSTGRES_DB=$PostgresDb -v ${PgVolumePath}:/var/lib/postgresql/data postgres:16-alpine",
  "for i in {1..30}; do docker exec $ContainerPostgres pg_isready -U $PostgresUser -d $PostgresDb >/dev/null 2>&1 && break; sleep 1; done",

  # Грузим оба образа из tar
  "docker load -i '$RemoteTar'",
  "rm -f '$RemoteTar'",

  # Туннель Ollama
  "docker stop $ContainerTunnel >/dev/null 2>&1 || true",
  "docker rm -f $ContainerTunnel >/dev/null 2>&1 || true",
  "docker run -d --name $ContainerTunnel --network $NetworkName --restart unless-stopped -p $TunnelPortMapping -e TUNNEL_PORT=4010 -e TUNNEL_API_PORT=11434 -e TUNNEL_SECRET='$TunnelSecret' '$TunnelImage'",

  # Миграции
  "docker rm -f $ContainerMigrate >/dev/null 2>&1 || true",
  "docker run --rm --name $ContainerMigrate --network $NetworkName -e DATABASE_URL='$DatabaseUrl' '$FullImage' npm run migrate:up",

  # Приложение
  "docker stop '$ContainerName' >/dev/null 2>&1 || true",
  "docker rm   '$ContainerName' >/dev/null 2>&1 || true",
  "docker run -d --name '$ContainerName' --network $NetworkName --restart unless-stopped --memory=$MemoryLimit --cpus=$CpuLimit -p $PortMapping $EnvArgs '$FullImage'",

  "docker image prune -f >/dev/null",
  "docker stats --no-stream '$ContainerName' '$ContainerTunnel'"
)
$remote = ($remoteLines -join "`n") + "`n"

$remote | ssh $sshTarget "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { throw "удалённый деплой упал" }

Remove-Item $LocalTar -Force -ErrorAction SilentlyContinue

Ok "Готово (БД пересоздана): http://$VpsHost/"
Ok "Туннель Ollama слушает ws://${VpsHost}:4010/ollama-tunnel"
Ok "Запусти на домашнем ПК: powershell -File .\scripts\start-tunnel.ps1"