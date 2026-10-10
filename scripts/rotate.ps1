# scripts/rotate.ps1
# Ротация секретов. -What db|jwt|tunnel|all (по умолчанию all).
[CmdletBinding()]
param(
    [ValidateSet('db','jwt','tunnel','all')]
    [string]$What = 'all',
    [switch]$Force,
    [switch]$SkipDeploy
)

. "$PSScriptRoot\_lib.ps1"

$root = Get-ProjectRoot -Start $PSScriptRoot
$cfg  = Get-DeployConfig -ProjectRoot $root
$sec  = Load-Secrets    -ProjectRoot $root
$target = "$($cfg.vps_user)@$($cfg.vps_host)"

Write-Host ''
Info "Что меняем: $What"
Warn 'JWT-секреты инвалидируют все активные сессии.'
Warn 'Пароль БД перезапустит app (~30 секунд downtime).'
Warn 'TUNNEL_SECRET требует перезапуска клиента на домашнем ПК.'
Write-Host ''

if (-not $Force) {
    if (-not (Confirm-Yes 'Продолжить?')) { Info 'Отменено'; exit 0 }
}

# ---------- DB password ----------
if ($What -in 'db','all') {
    $new = New-Secret 40

    Info 'Проверяю, что psql отвечает…'
    $ping = Invoke-RemoteCapture $target "docker exec $($cfg.container_postgres) psql -U $($cfg.postgres_user) -d $($cfg.postgres_db) -tAc 'SELECT 1' 2>&1"
    if ($ping -notmatch '1') {
        throw "psql недоступен. Вывод: $ping"
    }
    Ok 'psql отвечает'

    Info 'Меняю пароль PostgreSQL…'
    $sql = "ALTER USER $($cfg.postgres_user) WITH PASSWORD '$new';"

    # Способ 1 — here-doc в bash, самый надёжный при вложенных кавычках.
    $code = Invoke-Remote $target @(
        "docker exec -i $($cfg.container_postgres) psql -U $($cfg.postgres_user) -d $($cfg.postgres_db) <<'FSP_ROTATE_EOF'",
        $sql,
        'FSP_ROTATE_EOF'
    ) -IgnoreErrors

    # Способ 2 — если here-doc не сработал, пробуем через printf.
    if ($code -ne 0) {
        Warn 'Here-doc не сработал, пробую printf…'
        $code = Invoke-Remote $target @(
            "printf '%s\n' `"$sql`" | docker exec -i $($cfg.container_postgres) psql -U $($cfg.postgres_user) -d $($cfg.postgres_db)"
        ) -IgnoreErrors
    }

    if ($code -ne 0) {
        throw 'ALTER USER не удался ни одним способом. Проверь доступ к psql вручную.'
    }

    # Проверка, что новый пароль реально работает.
    $probe = Invoke-RemoteCapture $target "docker exec -e PGPASSWORD='$new' $($cfg.container_postgres) psql -U $($cfg.postgres_user) -d $($cfg.postgres_db) -tAc 'SELECT 1' 2>&1"
    if ($probe -notmatch '1') {
        throw "Пароль изменился, но новый не работает. Вывод: $probe"
    }

    $sec.POSTGRES_PASSWORD = $new
    Ok 'Пароль PostgreSQL обновлён и проверен'
}

# ---------- JWT ----------
if ($What -in 'jwt','all') {
    $sec.JWT_ACCESS_SECRET  = New-Secret 48
    $sec.JWT_REFRESH_SECRET = New-Secret 48
    Ok 'JWT-секреты перегенерированы'
}

# ---------- Tunnel ----------
if ($What -in 'tunnel','all') {
    $sec.TUNNEL_SECRET = New-Secret 48
    Ok 'TUNNEL_SECRET перегенерирован'
}

$sec | Add-Member -NotePropertyName rotated_at -NotePropertyValue (Get-Date).ToString('o') -Force
Save-Secrets -ProjectRoot $root -Secrets $sec
Ok 'Секреты сохранены в .deploy-secrets.json'

# ---------- .env ----------
$envPath = Join-Path $root '.env'
if (Test-Path -LiteralPath $envPath) {
    Info '.env обновляю через gen-env.ps1 -Rotate'
    $genEnv = Join-Path $PSScriptRoot 'gen-env.ps1'
    if (Test-Path -LiteralPath $genEnv) {
        & $genEnv -ProjectPath $root -Rotate
    } else {
        Warn 'gen-env.ps1 не найден — .env не обновлён'
    }
}

# ---------- Redeploy ----------
if (-not $SkipDeploy) {
    Info 'Пересобираю и перезапускаю app…'
    & (Join-Path $root 'deploy_up.ps1')
}

if ($What -in 'tunnel','all') {
    Write-Host ''
    Warn 'TUNNEL_SECRET изменён — перезапусти клиент на домашнем ПК:'
    Write-Host '   powershell -File .\scripts\start-tunnel.ps1' -ForegroundColor DarkGray
}

Write-Host ''
Ok 'Ротация завершена.'