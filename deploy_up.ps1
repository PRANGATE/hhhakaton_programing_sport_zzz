# deploy_up.ps1 - "up" без сброса БД. Туннель перезапускается,
# PostgreSQL и его данные остаются.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# ======================= НАСТРОЙКИ =======================
$ProjectPath = if ($PSScriptRoot) { Split-Path -Parent $PSCommandPath } else { (Get-Location).Path }

# Конфиг (создаётся scripts\setup.ps1, иначе — дефолты)
$cfgPath = Join-Path $ProjectPath '.deploy-config.json'
$cfg = if (Test-Path $cfgPath) {
    Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
    [pscustomobject]@{
        vps_user = 'root'; vps_host = '31.185.105.155'
        vps_docker_dir = '/home/PRANG/docker'
        container_app = 'fsp-app'; container_postgres = 'fsp-postgres'
        container_tunnel = 'fsp-ollama-tunnel'; container_migrate = 'fsp-migrate'
        network_name = 'fsp-net'
        image_name = 'fsp-hhru'; image_tag = 'latest'
        tunnel_image = 'fsp-ollama-tunnel:latest'
        port_mapping = '80:8080'; tunnel_port_mapping = '4010:4010'
        memory_limit = '320m'; cpu_limit = '0.5'
        postgres_user = 'fsp'; postgres_db = 'fsp'
    }
}

$ImageName     = $cfg.image_name
$ImageTag      = $cfg.image_tag
$FullImage     = "${ImageName}:${ImageTag}"
$TunnelImage   = $cfg.tunnel_image
$TunnelDockerfile = 'tunnel\Dockerfile'

$VpsUser       = $cfg.vps_user
$VpsHost       = $cfg.vps_host
$VpsDockerDir  = $cfg.vps_docker_dir
$RemoteTar     = "$VpsDockerDir/fsp-hhru-image.tar"
$PgVolumePath  = "$VpsDockerDir/pgdata"

$ContainerName     = $cfg.container_app
$ContainerMigrate  = $cfg.container_migrate
$ContainerPostgres = $cfg.container_postgres
$ContainerTunnel   = $cfg.container_tunnel
$NetworkName       = $cfg.network_name

$PortMapping        = $cfg.port_mapping
$TunnelPortMapping  = $cfg.tunnel_port_mapping
$MemoryLimit        = $cfg.memory_limit
$CpuLimit           = $cfg.cpu_limit

$PostgresUser  = $cfg.postgres_user
$PostgresDb    = $cfg.postgres_db

$SecretsFile   = Join-Path $ProjectPath '.deploy-secrets.json'
$LocalTar      = Join-Path $env:TEMP 'fsp-hhru-image.tar'
# =========================================================

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK: $m"  -ForegroundColor Green }
function Warn($m) { Write-Host "!! $m"   -ForegroundColor Yellow }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker не найден. Запусти Docker Desktop."
}
if (-not (Test-Path (Join-Path $ProjectPath "Dockerfile"))) {
  throw "Dockerfile не найден в $ProjectPath"
}
if (-not (Test-Path $SecretsFile)) {
  throw "Не найден $SecretsFile. Сначала .\deploy.ps1."
}

$sec = Get-Content $SecretsFile -Raw | ConvertFrom-Json
if (-not $sec.POSTGRES_PASSWORD -or -not $sec.JWT_ACCESS_SECRET -or
    -not $sec.JWT_REFRESH_SECRET -or -not $sec.TUNNEL_SECRET) {
  throw "В $SecretsFile не хватает полей (нужен TUNNEL_SECRET). Запусти .\deploy.ps1 -RotateSecrets."
}
Info "Секреты загружены из $SecretsFile"

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
  "OLLAMA_URL=http://${ContainerTunnel}:11434",
  "LLM_MODE=hybrid",
  "LLM_PROVIDER=ollama",
  "LLM_MODEL=llama3.1:8b",
  "LLM_TIMEOUT_MS=60000"
)
$EnvArgs = ($EnvVars | ForEach-Object { "-e `"$_`"" }) -join " "

Info "Сборка $FullImage"
docker build -t $FullImage $ProjectPath
if ($LASTEXITCODE -ne 0) { throw "docker build (app) упал" }

Info "Сборка $TunnelImage"
docker build -f (Join-Path $ProjectPath $TunnelDockerfile) -t $TunnelImage $ProjectPath
if ($LASTEXITCODE -ne 0) { throw "docker build (tunnel) упал" }

Info "docker save -> $LocalTar"
docker save -o $LocalTar $FullImage $TunnelImage
if ($LASTEXITCODE -ne 0) { throw "docker save упал" }
Ok ("tar: {0:N1} MB" -f ((Get-Item $LocalTar).Length / 1MB))

$sshTarget = "$VpsUser@$VpsHost"
ssh $sshTarget "mkdir -p '$VpsDockerDir'"
scp $LocalTar "${sshTarget}:$RemoteTar"
if ($LASTEXITCODE -ne 0) { throw "scp упал" }

Info "миграции + перезапуск (данные PostgreSQL сохраняются)"
$remoteLines = @(
  "set -e",
  "docker network inspect $NetworkName >/dev/null 2>&1 || docker network create $NetworkName",

  "if docker inspect $ContainerPostgres >/dev/null 2>&1; then",
  "  docker start $ContainerPostgres >/dev/null 2>&1 || true",
  "else",
  "  echo '!! Контейнер $ContainerPostgres не найден. Первая инициализация: .\\deploy.ps1'; exit 2;",
  "fi",
  "for i in {1..30}; do docker exec $ContainerPostgres pg_isready -U $PostgresUser -d $PostgresDb >/dev/null 2>&1 && break; sleep 1; done",

  "docker load -i '$RemoteTar'",
  "rm -f '$RemoteTar'",

  # Туннель пересоздаём всегда — он stateless
  "docker stop $ContainerTunnel >/dev/null 2>&1 || true",
  "docker rm -f $ContainerTunnel >/dev/null 2>&1 || true",
  "docker run -d --name $ContainerTunnel --network $NetworkName --restart unless-stopped -p $TunnelPortMapping -e TUNNEL_PORT=4010 -e TUNNEL_API_PORT=11434 -e TUNNEL_SECRET='$TunnelSecret' '$TunnelImage'",

  "if ! docker run --rm --name $ContainerMigrate --network $NetworkName -e DATABASE_URL='$DatabaseUrl' '$FullImage' npm run migrate:up; then",
  "  echo '!! Миграции упали. Вероятно, пароль PostgreSQL в .deploy-secrets.json не совпадает.'; exit 3;",
  "fi",

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
Ok "Готово (данные БД сохранены): http://$VpsHost/"