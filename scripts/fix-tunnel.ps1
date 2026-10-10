# scripts/fix-tunnel.ps1
# Пересоздаёт контейнер fsp-ollama-tunnel с актуальным TUNNEL_SECRET из .deploy-secrets.json.
# Не пересобирает образ — использует существующий fsp-ollama-tunnel:latest на VPS.
[CmdletBinding()]
param()
. "$PSScriptRoot\_lib.ps1"

$root = Get-ProjectRoot -Start $PSScriptRoot
$cfg  = Get-DeployConfig -ProjectRoot $root
$sec  = Load-Secrets    -ProjectRoot $root
$target = "$($cfg.vps_user)@$($cfg.vps_host)"

Assert-SshTarget $target

if (-not $sec.TUNNEL_SECRET) { throw 'В .deploy-secrets.json нет TUNNEL_SECRET.' }

Write-Host ''
Info 'Секрет из .deploy-secrets.json:'
$shown = $sec.TUNNEL_SECRET.Substring(0, [Math]::Min(10, $sec.TUNNEL_SECRET.Length))
Write-Host "  $shown… ($($sec.TUNNEL_SECRET.Length) симв.)" -ForegroundColor DarkGray
Write-Host ''

Info 'Что в контейнере ДО пересоздания:'
$old = Invoke-RemoteCapture $target "docker exec $($cfg.container_tunnel) printenv TUNNEL_SECRET 2>/dev/null"
if ($old) {
    $oldShown = $old.Substring(0, [Math]::Min(10, $old.Length))
    Write-Host "  $oldShown… ($($old.Length) симв.)" -ForegroundColor DarkGray
} else {
    Write-Host '  (контейнер не найден или не отвечает)' -ForegroundColor DarkGray
}
Write-Host ''

if ($old -eq $sec.TUNNEL_SECRET) {
    Ok 'Секреты уже совпадают. Пересоздание не нужно.'
    exit 0
}

Info 'Проверяю, что образ есть на VPS…'
$imgId = Invoke-RemoteCapture $target "docker image inspect $($cfg.tunnel_image) --format '{{.Id}}' 2>/dev/null"
if ($imgId -notmatch 'sha256:') {
    throw "Образ $($cfg.tunnel_image) не найден на VPS. Сначала: deploy_up.ps1"
}
Ok "Образ найден"

Info 'Пересоздаю контейнер туннеля…'
Invoke-Remote $target @(
    "docker stop $($cfg.container_tunnel) >/dev/null 2>&1 || true",
    "docker rm -f $($cfg.container_tunnel) >/dev/null 2>&1 || true",
    "docker run -d --name $($cfg.container_tunnel) --network $($cfg.network_name) --restart unless-stopped -p $($cfg.tunnel_port_mapping) -e TUNNEL_PORT=4010 -e TUNNEL_API_PORT=11434 -e TUNNEL_SECRET='$($sec.TUNNEL_SECRET)' '$($cfg.tunnel_image)'",
    "sleep 2",
    "docker ps --filter name=$($cfg.container_tunnel) --format 'table {{.Names}}\t{{.Status}}'"
) | Out-Null
Ok 'Контейнер пересоздан'

Write-Host ''
Info 'Что в контейнере ПОСЛЕ:'
$new = Invoke-RemoteCapture $target "docker exec $($cfg.container_tunnel) printenv TUNNEL_SECRET"
$newShown = $new.Substring(0, [Math]::Min(10, $new.Length))
Write-Host "  $newShown… ($($new.Length) симв.)" -ForegroundColor DarkGray

if ($new -eq $sec.TUNNEL_SECRET) {
    Write-Host ''
    Ok 'Секреты совпадают. Теперь запусти туннель на домашнем ПК:'
    Write-Host '   powershell -File .\scripts\start-tunnel.ps1' -ForegroundColor DarkGray
} else {
    Warn 'Секреты всё ещё не совпадают — что-то пошло не так.'
    exit 1
}