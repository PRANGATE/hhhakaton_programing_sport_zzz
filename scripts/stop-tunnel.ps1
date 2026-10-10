# scripts/stop-tunnel.ps1
# Останавливает локальный процесс tunnel/client.js.
[CmdletBinding()]
param()
. "$PSScriptRoot\_lib.ps1"

$procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'tunnel[\\/]client\.js' }

if (-not $procs) {
    Info 'Активных процессов tunnel/client.js не найдено'
    exit 0
}

foreach ($p in $procs) {
    try {
        Stop-Process -Id $p.ProcessId -Force
        Ok "Остановлен PID $($p.ProcessId)"
    } catch {
        Warn "Не удалось остановить PID $($p.ProcessId): $($_.Exception.Message)"
    }
}