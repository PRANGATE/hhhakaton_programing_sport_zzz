# scripts/status.ps1
# Статус контейнеров и логи.
[CmdletBinding()]
param(
    [switch]$Logs,
    [switch]$Follow,
    [int]$Tail = 100,
    [string]$Container
)

. "$PSScriptRoot\_lib.ps1"

$root = Get-ProjectRoot -Start $PSScriptRoot
$cfg  = Get-DeployConfig -ProjectRoot $root
$target = "$($cfg.vps_user)@$($cfg.vps_host)"
Assert-SshTarget $target

if ($Logs) {
    $names = if ($Container) { @($Container) } else {
        @($cfg.container_app, $cfg.container_postgres, $cfg.container_tunnel)
    }
    $flags = @('logs')
    if ($Follow) { $flags += '-f' }
    $flags += @('--tail', "$Tail")

    foreach ($name in $names) {
        Write-Host ''
        Write-Host "───── $name ─────" -ForegroundColor Cyan
        $cmd = ($flags + @($name)) -join ' '
        $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        try { & ssh $target "docker $cmd" } finally { $ErrorActionPreference = $prev }
    }
    exit 0
}

Info "Статус контейнеров на $target"
Write-Host ''
Write-Host (Invoke-RemoteCapture $target "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'fsp-|NAMES'")

Write-Host ''
Info 'Использование ресурсов'
Write-Host (Invoke-RemoteCapture $target "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' $($cfg.container_app) $($cfg.container_postgres) $($cfg.container_tunnel)")

Write-Host ''
Info 'Health-эндпоинты'
$h = Invoke-RemoteCapture $target 'curl -sf http://127.0.0.1/health || echo DOWN'
$r = Invoke-RemoteCapture $target 'curl -sf http://127.0.0.1/ready  || echo DOWN'
$a = Invoke-RemoteCapture $target 'curl -sf http://127.0.0.1/api/v1/ai/health 2>/dev/null || echo DOWN'
Write-Host "  /health          : $h"
Write-Host "  /ready           : $r"
Write-Host "  /api/v1/ai/health: $a"