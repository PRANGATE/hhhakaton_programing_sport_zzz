# scripts/setup.ps1
# Первичная настройка. Создаёт .deploy-config.json, .deploy-secrets.json, .env.
[CmdletBinding()]
param(
    [string]$ProjectPath,
    [string]$VpsHost,
    [string]$VpsUser,
    [string]$VpsDockerDir,
    [switch]$Force
)

. "$PSScriptRoot\_lib.ps1"

if (-not $ProjectPath) { $ProjectPath = Get-ProjectRoot -Start $PSScriptRoot }
Info "Корень проекта: $ProjectPath"

$cfgPath     = Join-Path $ProjectPath '.deploy-config.json'
$secretsPath = Join-Path $ProjectPath '.deploy-secrets.json'

if (-not $Force) {
    if (Test-Path -LiteralPath $cfgPath) {
        Warn "$cfgPath уже существует."
        if (-not (Confirm-Yes 'Перезаписать?')) { exit 0 }
    }
    if (Test-Path -LiteralPath $secretsPath) {
        Warn "$secretsPath уже существует."
        Warn 'Перезапись сгенерирует новые секреты и обнулит все JWT.'
        if (-not (Confirm-Yes 'Перезаписать?')) { exit 0 }
    }
}

# Проверки
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Warn 'docker не найден в PATH. Сборка не сработает, но конфиг создам.'
} else { Ok 'docker найден' }

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    throw 'ssh не найден в PATH. Установи OpenSSH Client.'
}
Ok 'ssh найден'

# Опрос
if (-not $VpsHost)      { $VpsHost      = Read-HostDefault 'VPS host'       '31.185.105.155' }
if (-not $VpsUser)      { $VpsUser      = Read-HostDefault 'VPS user'       'root' }
if (-not $VpsDockerDir) { $VpsDockerDir = Read-HostDefault 'VPS docker dir' '/home/PRANG/docker' }

# Секреты
$secrets = [ordered]@{
    POSTGRES_PASSWORD  = New-Secret 40
    JWT_ACCESS_SECRET  = New-Secret 48
    JWT_REFRESH_SECRET = New-Secret 48
    TUNNEL_SECRET      = New-Secret 48
    generated_at       = (Get-Date).ToString('o')
}

# Конфиг
$cfg = [ordered]@{
    project_path        = $ProjectPath
    vps_user            = $VpsUser
    vps_host            = $VpsHost
    vps_docker_dir      = $VpsDockerDir
    container_app       = 'fsp-app'
    container_postgres  = 'fsp-postgres'
    container_tunnel    = 'fsp-ollama-tunnel'
    container_migrate   = 'fsp-migrate'
    network_name        = 'fsp-net'
    image_name          = 'fsp-hhru'
    image_tag           = 'latest'
    tunnel_image        = 'fsp-ollama-tunnel:latest'
    port_mapping        = '80:8080'
    tunnel_port_mapping = '4010:4010'
    memory_limit        = '320m'
    cpu_limit           = '0.5'
    postgres_user       = 'fsp'
    postgres_db         = 'fsp'
}

$cfg     | ConvertTo-Json | Set-Content -LiteralPath $cfgPath     -Encoding UTF8
$secrets | ConvertTo-Json | Set-Content -LiteralPath $secretsPath -Encoding UTF8

Ok "Конфиг:  $cfgPath"
Ok "Секреты: $secretsPath (gitignored)"

# .env
$envPath    = Join-Path $ProjectPath '.env'
$envExample = Join-Path $ProjectPath '.env.example'
if ((Test-Path -LiteralPath $envExample) -and -not (Test-Path -LiteralPath $envPath)) {
    Info 'Генерирую .env из .env.example…'
    $genEnv = Join-Path $PSScriptRoot 'gen-env.ps1'
    if (Test-Path -LiteralPath $genEnv) { & $genEnv -ProjectPath $ProjectPath }
    else { Warn 'gen-env.ps1 не найден — .env не создан' }
} elseif (Test-Path -LiteralPath $envPath) {
    Ok '.env уже существует'
}

# SSH
$target = "$VpsUser@$VpsHost"
Info "Проверяю SSH к $target…"
if (Test-SshConnection $target) { Ok 'SSH работает' }
else { Warn "SSH к $target не работает. Проверь ключ." }

Write-Host ''
Ok 'Готово. Дальше:'
Write-Host '   powershell -File .\deploy.ps1       # первый деплой'   -ForegroundColor DarkGray
Write-Host '   powershell -File .\scripts\menu.ps1 # интерактивное меню' -ForegroundColor DarkGray