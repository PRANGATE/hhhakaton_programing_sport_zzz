# deploy.ps1 - сборка локально, доставка на VPS, миграции + перезапуск
# Секреты хранятся в .deploy-secrets.json (gitignored), генерятся один раз.

[CmdletBinding()]
param(
  [switch]$RotateSecrets   # принудительно перегенерировать JWT-секреты и пароль БД
)

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

$PostgresUser  = "fsp"
$PostgresDb    = "fsp"

$SecretsFile   = Join-Path $ProjectPath ".deploy-secrets.json"
$LocalTar      = Join-Path $env:TEMP "fsp-hhru-image.tar"
# =========================================================

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK: $m"  -ForegroundColor Green }
function Warn($m) { Write-Host "!! $m"   -ForegroundColor Yellow }

# --- генератор случайной строки для секретов ---
function New-Secret([int]$len = 48) {
  # только безопасные символы: буквы, цифры и -_ (без кавычек и $, чтобы не ломать env)
  $chars = (48..57) + (65..90) + (97..122) + @(45, 95)  # 0-9 A-Z a-z - _
  -join (1..$len | ForEach-Object { [char]($chars | Get-Random) })
}

# --- загрузка/генерация секретов ---
function Get-Secrets {
  $need = -not (Test-Path $SecretsFile)
  if ($need) {
    Info "Секреты не найдены, генерирую новые"
    $secrets = [ordered]@{
      POSTGRES_PASSWORD   = New-Secret 40
      JWT_ACCESS_SECRET   = New-Secret 48
      JWT_REFRESH_SECRET  = New-Secret 48
      generated_at        = (Get-Date).ToString("o")
    }
    $secrets | ConvertTo-Json | Set-Content -Path $SecretsFile -Encoding UTF8
    Ok "Секреты сохранены в $SecretsFile (файл gitignored)"
    return $secrets
  }

  $secrets = Get-Content $SecretsFile -Raw | ConvertFrom-Json
  if ($RotateSecrets) {
    Warn "RotateSecrets: перегенерирую секреты. Все ранее выданные JWT станут невалидными."
    Warn "Пользователи должны будут заново залогиниться."
    $confirm = Read-Host "Продолжить? (yes/no)"
    if ($confirm -ne "yes") { throw "Отменено пользователем" }

    $secrets = [ordered]@{
      POSTGRES_PASSWORD   = New-Secret 40
      JWT_ACCESS_SECRET   = New-Secret 48
      JWT_REFRESH_SECRET  = New-Secret 48
      generated_at        = (Get-Date).ToString("o")
    }
    $secrets | ConvertTo-Json | Set-Content -Path $SecretsFile -Encoding UTF8
    Ok "Секреты перегенерированы"
  } else {
    Info "Секреты загружены из $SecretsFile (сгенерированы $($secrets.generated_at))"
  }
  return $secrets
}

# --- проверки окружения ---
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker не найден. Запусти Docker Desktop."
}
if (-not (Test-Path (Join-Path $ProjectPath "Dockerfile"))) {
  throw "Dockerfile не найден в $ProjectPath"
}

# --- получаем секреты ---
$sec = Get-Secrets

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
  "docker network inspect $NetworkName >/dev/null 2>&1 || docker network create $NetworkName",

  # postgres: стартуем или создаём (пароль из секретов)
  "docker start $ContainerPostgres >/dev/null 2>&1 || docker run -d --name $ContainerPostgres --network $NetworkName --restart unless-stopped -e POSTGRES_USER=$PostgresUser -e POSTGRES_PASSWORD=$PostgresPassword -e POSTGRES_DB=$PostgresDb -v ${PgVolumePath}:/var/lib/postgresql/data postgres:16-alpine",

  "for i in {1..30}; do docker exec $ContainerPostgres pg_isready -U $PostgresUser -d $PostgresDb >/dev/null 2>&1 && break; sleep 1; done",

  "docker load -i '$RemoteTar'",
  "rm -f '$RemoteTar'",

  "docker rm -f $ContainerMigrate >/dev/null 2>&1 || true",
  "docker run --rm --name $ContainerMigrate --network $NetworkName -e DATABASE_URL='$DatabaseUrl' '$FullImage' npm run migrate:up",

  "docker stop '$ContainerName' >/dev/null 2>&1 || true",
  "docker rm   '$ContainerName' >/dev/null 2>&1 || true",
  "docker run -d --name '$ContainerName' --network $NetworkName --restart unless-stopped --memory=$MemoryLimit --cpus=$CpuLimit -p $PortMapping $EnvArgs '$FullImage'",

  "docker image prune -f >/dev/null",
  "docker stats --no-stream '$ContainerName'"
)
$remote = ($remoteLines -join "`n") + "`n"

$remote | ssh $sshTarget "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { throw "удалённый деплой упал" }

Remove-Item $LocalTar -Force -ErrorAction SilentlyContinue

Ok "Готово: http://$VpsHost/"