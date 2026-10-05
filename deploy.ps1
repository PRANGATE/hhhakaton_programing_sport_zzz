# deploy.ps1 - сборка локально, доставка на VPS, миграции + перезапуск
$ErrorActionPreference = "Stop"

# ======================= НАСТРОЙКИ =======================
$ProjectPath   = "F:\hhru"
$ImageName     = "fsp-hhru"
$ImageTag      = "latest"
$FullImage     = "${ImageName}:${ImageTag}"

$VpsUser       = "root"
$VpsHost       = "31.185.105.155"
$VpsDockerDir  = "/home/PRANG/docker"
$RemoteTar     = "$VpsDockerDir/fsp-hhru-image.tar"
$PgVolumePath  = "$VpsDockerDir/pgdata"

$ContainerName     = "fsp-app"
$ContainerMigrate  = "fsp-migrate"
$ContainerPostgres = "fsp-postgres"
$NetworkName       = "fsp-net"

$PortMapping   = "80:8080"
$MemoryLimit   = "320m"
$CpuLimit      = "0.5"

# Реквизиты БД (для прод-деплоя смени пароль!)
$PostgresUser     = "fsp"
$PostgresPassword = "fsp_secret"
$PostgresDb       = "fsp"
$DatabaseUrl      = "postgres://${PostgresUser}:${PostgresPassword}@${ContainerPostgres}:5432/${PostgresDb}"

$EnvVars = @(
  "NODE_ENV=production",
  "PORT=3000",
  "NODE_OPTIONS=--max-old-space-size=192",
  "DATABASE_URL=$DatabaseUrl",
  "KEYCLOAK_ENABLED=false",
  "KEYCLOAK_URL=https://id.fsp.example",
  "KEYCLOAK_REALM=fsp",
  "KEYCLOAK_CLIENT_ID=fsp-web"
)
$EnvArgs = ($EnvVars | ForEach-Object { "-e `"$_`"" }) -join " "

$LocalTar = Join-Path $env:TEMP "fsp-hhru-image.tar"
# =========================================================

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK: $m"  -ForegroundColor Green }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker не найден. Запусти Docker Desktop."
}
if (-not (Test-Path (Join-Path $ProjectPath "Dockerfile"))) {
    throw "Dockerfile не найден в $ProjectPath"
}

# 1. Сборка
Info "Сборка $FullImage"
docker build -t $FullImage $ProjectPath
if ($LASTEXITCODE -ne 0) { throw "docker build упал" }
Ok "образ собран"

# 2. save
Info "docker save -> $LocalTar"
docker save -o $LocalTar $FullImage
if ($LASTEXITCODE -ne 0) { throw "docker save упал" }
Ok ("tar: {0:N1} MB" -f ((Get-Item $LocalTar).Length / 1MB))

$sshTarget = "$VpsUser@$VpsHost"

# 3. mkdir + scp
Info "mkdir на VPS"
ssh $sshTarget "mkdir -p '$VpsDockerDir' '$PgVolumePath'"
if ($LASTEXITCODE -ne 0) { throw "ssh/mkdir упал" }

Info "scp -> $RemoteTar"
scp $LocalTar "${sshTarget}:$RemoteTar"
if ($LASTEXITCODE -ne 0) { throw "scp упал" }
Ok "доставлено"

# 4. Подготовка БД + миграции + перезапуск (LF, без CRLF)
Info "prepare db + migrate + restart"

$remoteLines = @(
  'set -e',

  # сеть для контейнеров
  "docker network inspect $NetworkName >/dev/null 2>&1 || docker network create $NetworkName",

  # postgres: стартуем или создаём
  "docker start $ContainerPostgres >/dev/null 2>&1 || docker run -d --name $ContainerPostgres --network $NetworkName --restart unless-stopped -e POSTGRES_USER=$PostgresUser -e POSTGRES_PASSWORD=$PostgresPassword -e POSTGRES_DB=$PostgresDb -v $PgVolumePath:/var/lib/postgresql/data postgres:16-alpine",

  # ждём готовности БД (до 30 сек)
  "for i in {1..30}; do docker exec $ContainerPostgres pg_isready -U $PostgresUser -d $PostgresDb >/dev/null 2>&1 && break; sleep 1; done",

  # загружаем образ app
  "docker load -i '$RemoteTar'",
  "rm -f '$RemoteTar'",

  # миграции (одноразовый контейнер, переопределяем CMD)
  "docker rm -f $ContainerMigrate >/dev/null 2>&1 || true",
  "docker run --rm --name $ContainerMigrate --network $NetworkName -e DATABASE_URL='$DatabaseUrl' '$FullImage' npm run migrate:up",

  # app: стоп старого, старт нового
  "docker stop '$ContainerName' >/dev/null 2>&1 || true",
  "docker rm   '$ContainerName' >/dev/null 2>&1 || true",
  "docker run -d --name '$ContainerName' --network $NetworkName --restart unless-stopped --memory=$MemoryLimit --cpus=$CpuLimit -p $PortMapping $EnvArgs '$FullImage'",

  "docker image prune -f >/dev/null",
  "docker stats --no-stream '$ContainerName'"
)
$remote = ($remoteLines -join "`n") + "`n"

# отправляем через stdin; tr вырезает \r на случай CRLF
$remote | ssh $sshTarget "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { throw "удалённый деплой упал" }

# 5. чистим локальный tar
Remove-Item $LocalTar -Force -ErrorAction SilentlyContinue

Ok "Готово: http://$VpsHost/"