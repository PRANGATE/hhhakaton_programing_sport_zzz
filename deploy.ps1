# deploy.ps1 - build locally, ship to VPS, run there
$ErrorActionPreference = "Stop"

# ======================= НАСТРОЙКИ =======================
$ProjectPath   = "F:\hhru"
$ImageName     = "fsp-hhru"
$ImageTag      = "latest"
$FullImage     = "$ImageName`:$ImageTag"

$VpsUser       = "root"
$VpsHost       = "31.185.105.155"
$VpsDockerDir  = "/home/PRANG/docker"
$RemoteTar     = "$VpsDockerDir/fsp-hhru-image.tar"

$ContainerName = "fsp-app"
$PortMapping   = "80:3000"
$MemoryLimit   = "256m"
$CpuLimit      = "0.5"

# Keycloak / ФСП ID — включишь после хакатона
$EnvVars = @(
  "NODE_ENV=production",
  "PORT=3000",
  "NODE_OPTIONS=--max-old-space-size=192",
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
ssh $sshTarget "mkdir -p '$VpsDockerDir'"
if ($LASTEXITCODE -ne 0) { throw "ssh/mkdir упал" }

Info "scp -> $RemoteTar"
scp $LocalTar "${sshTarget}:$RemoteTar"
if ($LASTEXITCODE -ne 0) { throw "scp упал" }
Ok "доставлено"

# 4. load + перезапуск (строки через LF, без CRLF)
Info "docker load + перезапуск"

$remoteLines = @(
  'set -e',
  "docker load -i '$RemoteTar'",
  "docker stop '$ContainerName' >/dev/null 2>&1 || true",
  "docker rm   '$ContainerName' >/dev/null 2>&1 || true",
  "docker run -d --name '$ContainerName' --restart unless-stopped --memory=$MemoryLimit --cpus=$CpuLimit -p $PortMapping $EnvArgs '$FullImage'",
  "rm -f '$RemoteTar'",
  "docker image prune -f >/dev/null",
  "docker stats --no-stream '$ContainerName'"
)
$remote = ($remoteLines -join "`n") + "`n"

# отправляем через stdin; tr на всякий случай вырезает \r
$remote | ssh $sshTarget "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { throw "удалённый деплой упал" }

# 5. чистим локальный tar
Remove-Item $LocalTar -Force -ErrorAction SilentlyContinue

Ok "Готово: http://$VpsHost/"