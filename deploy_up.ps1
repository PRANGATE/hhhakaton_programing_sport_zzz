# deploy_up.ps1 - "up" обновление: пересобирает и перезапускает ТОЛЬКО приложение.
# НЕ трогает контейнер PostgreSQL, его данные и пароли.
# Секреты берутся из .deploy-secrets.json без изменений.
# Если пароль в секретах расходится с паролем работающего postgres — упадёт
# с подсказкой запустить .\deploy.ps1 (полный сброс).

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# ======================= НАСТРОЙКИ (должны совпадать с deploy.ps1) =======================
$ProjectPath   = "F:\hhru"
$ImageName     = "fsp-hhru"
$ImageTag      = "latest"
$FullImage     = "${ImageName}:${ImageTag}"

$VpsUser       = "root"
$VpsHost       = "31.185.105.155"
$VpsDockerDir  = "/home/PRANG/docker"
$RemoteTar     = "$VpsDockerDir/fsp-hhru-image.tar"

$ContainerName     = "fsp-app"
$ContainerMigrate  = "fsp-migrate"
$ContainerPostgres = "fsp-postgres"
$NetworkName       = "fsp-net"

$PortMapping   = "80:8080"
$MemoryLimit   = "320m"
$CpuLimit      = "0.5"

$PostgresUser  = "fsp"
$PostgresDb    = "fsp"

$SecretsFile   = Join-Path $ProjectPath ".deploy-secrets.json"
$LocalTar      = Join-Path $env:TEMP "fsp-hhru-image.tar"
# ==========================================================================================

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK: $m"  -ForegroundColor Green }
function Warn($m) { Write-Host "!! $m"   -ForegroundColor Yellow }

# --- проверки ---
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker не найден. Запусти Docker Desktop."
}
if (-not (Test-Path (Join-Path $ProjectPath "Dockerfile"))) {
  throw "Dockerfile не найден в $ProjectPath"
}
if (-not (Test-Path $SecretsFile)) {
  throw "Не найден $SecretsFile. Сначала запусти .\deploy.ps1 для первичной инициализации."
}

$sec = Get-Content $SecretsFile -Raw | ConvertFrom-Json
if (-not $sec.POSTGRES_PASSWORD -or
    -not $sec.JWT_ACCESS_SECRET -or
    -not $sec.JWT_REFRESH_SECRET) {
  throw "В $SecretsFile не хватает полей. Запусти .\deploy.ps1 -RotateSecrets."
}
Info "Секреты загружены из $SecretsFile (сгенерированы $($sec.generated_at))"

$PostgresPassword = $sec.POSTGRES_PASSWORD
$JwtAccessSecret  = $sec.JWT_ACCESS_SECRET
$JwtRefreshSecret = $sec.JWT_REFRESH_SECRET
$DatabaseUrl = "postgres://${PostgresUser}:${PostgresPassword}@${ContainerPostgres}:5432/${PostgresDb}"

$EnvVars = @(
  "NODE_ENV=production",
  "PORT=3000",
  "NODE_OPTIONS=--max-old-space-size=192",
  "DATABASE_URL=$DatabaseUrl",
  "JWT_ACCESS_SECRET=$JwtAccessSecret",
  "JWT_REFRESH_SECRET=$JwtRefreshSecret",
  "JWT_ACCESS_TTL=15m",
  "JWT_REFRESH_TTL=30d",
  "KEYCLOAK_ENABLED=false",
  "KEYCLOAK_URL=https://id.fsp.example",
  "KEYCLOAK_REALM=fsp",
  "KEYCLOAK_CLIENT_ID=fsp-web"
)
$EnvArgs = ($EnvVars | ForEach-Object { "-e `"$_`"" }) -join " "

# --- 1. сборка ---
Info "Сборка $FullImage"
docker build -t $FullImage $ProjectPath
if ($LASTEXITCODE -ne 0) { throw "docker build упал" }
Ok "образ собран"

# --- 2. save ---
Info "docker save -> $LocalTar"
docker save -o $LocalTar $FullImage
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

# --- 4. миграции + перезапуск (БЕЗ сброса БД) ---
Info "миграции + перезапуск приложения (данные PostgreSQL сохраняются)"
$remoteLines = @(
  "set -e",
  "docker network inspect $NetworkName >/dev/null 2>&1 || docker network create $NetworkName",

  # postgres: только СТАРТУЕМ, если остановлен. Ничего не удаляем и не пересоздаём.
  "if docker inspect $ContainerPostgres >/dev/null 2>&1; then",
  "  docker start $ContainerPostgres >/dev/null 2>&1 || true",
  "else",
  "  echo '!! Контейнер $ContainerPostgres не найден.';",
  "  echo '!! Первая инициализация: запусти .\\deploy.ps1';",
  "  exit 2;",
  "fi",

  "for i in {1..30}; do docker exec $ContainerPostgres pg_isready -U $PostgresUser -d $PostgresDb >/dev/null 2>&1 && break; sleep 1; done",

  "docker load -i '$RemoteTar'",
  "rm -f '$RemoteTar'",

  # миграции (упадут, если пароль в DATABASE_URL не совпадает с реальным)
  "if ! docker run --rm --name $ContainerMigrate --network $NetworkName -e DATABASE_URL='$DatabaseUrl' '$FullImage' npm run migrate:up; then",
  "  echo '!! Миграции упали. Вероятно, пароль PostgreSQL в .deploy-secrets.json';",
  "  echo '!! не совпадает с паролем работающего контейнера $ContainerPostgres.';",
  "  echo '!! Запусти .\\deploy.ps1 (полный сброс) или .\\deploy.ps1 -RotateSecrets.';",
  "  exit 3;",
  "fi",

  "docker stop '$ContainerName' >/dev/null 2>&1 || true",
  "docker rm   '$ContainerName' >/dev/null 2>&1 || true",
  "docker run -d --name '$ContainerName' --network $NetworkName --restart unless-stopped --memory=$MemoryLimit --cpus=$CpuLimit -p $PortMapping $EnvArgs '$FullImage'",

  "docker image prune -f >/dev/null",
  "docker stats --no-stream '$ContainerName'"
)
$remote = ($remoteLines -join "`n") + "`n"

$remote | ssh $sshTarget "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { throw "удалённый деплой упал (см. диагностику выше)" }

Remove-Item $LocalTar -Force -ErrorAction SilentlyContinue

Ok "Готово (данные БД сохранены): http://$VpsHost/"