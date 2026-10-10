# scripts/menu.ps1
# Интерактивное меню.
. "$PSScriptRoot\_lib.ps1"

$root = Get-ProjectRoot -Start $PSScriptRoot
Set-Location $root

function Pause-Menu { [void](Read-Host "`nНажми Enter для возврата в меню") }

function Invoke-Sub {
    param([string]$Script, [string[]]$Args = @())
    Write-Host ''
    Info "Запускаю: $Script $($Args -join ' ')"
    Write-Host ''
    try {
        $path = Join-Path $root $Script
        if (-not (Test-Path -LiteralPath $path)) { throw "Не найден $path" }
        & $path @Args
    } catch {
        Fail $_.Exception.Message
    }
    Pause-Menu
}

while ($true) {
    Clear-Host
    Write-Host '=========================================' -ForegroundColor DarkCyan
    Write-Host '   ФСП · Платформа ИТ-вакансий — меню'     -ForegroundColor Cyan
    Write-Host '=========================================' -ForegroundColor DarkCyan
    Write-Host "  Проект: $root"                        -ForegroundColor DarkGray
    try {
        $cfg = Get-DeployConfig -ProjectRoot $root
        Write-Host "  VPS:    $($cfg.vps_user)@$($cfg.vps_host)" -ForegroundColor DarkGray
    } catch {}
    Write-Host ''
    Write-Host '   1. Диагностика окружения'         -ForegroundColor White
    Write-Host '   2. Деплой БЕЗ сброса БД'          -ForegroundColor White
    Write-Host '   3. Деплой СО сбросом БД'          -ForegroundColor Red
    Write-Host '   4. Статус контейнеров'            -ForegroundColor White
    Write-Host '   5. Логи (live tail)'              -ForegroundColor White
    Write-Host '   6. Ротация секретов'              -ForegroundColor White
    Write-Host '   7. Бэкап БД'                      -ForegroundColor White
    Write-Host '   8. Восстановить БД (последний)'   -ForegroundColor White
    Write-Host '   9. Запустить Ollama-туннель'      -ForegroundColor White
    Write-Host '  10. Остановить Ollama-туннель'     -ForegroundColor White
    Write-Host '  11. Показать .deploy-config.json'  -ForegroundColor White
    Write-Host '  12. Показать .deploy-secrets.json' -ForegroundColor White
    Write-Host '  13. Первичная настройка (setup)'   -ForegroundColor White
    Write-Host '   0. Выход'                         -ForegroundColor DarkGray
    Write-Host ''

    switch (Read-Host 'Выбор') {

        '1'  { Invoke-Sub 'scripts\doctor.ps1' }

        '2'  { Invoke-Sub 'deploy_up.ps1' }

        '3'  {
            Warn 'УНИЧТОЖИТ все данные в БД.'
            if (Confirm-Yes 'Точно?') { Invoke-Sub 'deploy.ps1' } else { Info 'Отменено'; Pause-Menu }
        }

        '4'  { Invoke-Sub 'scripts\status.ps1' }

        '5'  { Invoke-Sub 'scripts\status.ps1' -Args @('-Logs','-Follow') }

        '6'  { Invoke-Sub 'scripts\rotate.ps1' }

        '7'  { Invoke-Sub 'scripts\backup.ps1' }

        '8'  {
            $backupDir = Join-Path $root 'backups'
            $files = Get-ChildItem -LiteralPath $backupDir -Filter 'fsp-*.sql.gz' -ErrorAction SilentlyContinue |
                     Sort-Object LastWriteTime -Descending
            if (-not $files -or $files.Count -eq 0) {
                Warn "В $backupDir нет дампов. Сначала сделай бэкап (пункт 7)."
                Pause-Menu
            } else {
                Write-Host ''
                Info 'Доступные бэкапы:'
                for ($i = 0; $i -lt $files.Count; $i++) {
                    $size = [Math]::Round($files[$i].Length / 1KB, 1)
                    Write-Host ("  [{0}] {1}  ({2} KB)" -f $i, $files[$i].Name, $size)
                }
                Write-Host ''
                $pick = Read-Host "Номер (Enter = последний):"
                $selected = if ([string]::IsNullOrWhiteSpace($pick)) { $files[0].FullName }
                            else { $files[[int]$pick].FullName }
                Invoke-Sub 'scripts\backup.ps1' -Args @('-Restore', $selected)
            }
        }

        '9'  { Invoke-Sub 'scripts\start-tunnel.ps1' }

        '10' { Invoke-Sub 'scripts\stop-tunnel.ps1' }

        '11' {
            $f = Join-Path $root '.deploy-config.json'
            if (-not (Test-Path -LiteralPath $f)) {
                Warn "Нет $f"
                if (Confirm-Yes 'Создать через scripts\setup.ps1?') { Invoke-Sub 'scripts\setup.ps1' }
                else { Pause-Menu }
            } else {
                Show-JsonFile -Path $f
                Pause-Menu
            }
        }

        '12' {
            $f = Join-Path $root '.deploy-secrets.json'
            if (-not (Test-Path -LiteralPath $f)) {
                Warn "Нет $f"
                if (Confirm-Yes 'Создать через scripts\setup.ps1?') { Invoke-Sub 'scripts\setup.ps1' }
                else { Pause-Menu }
            } else {
                Show-JsonFile -Path $f
                Pause-Menu
            }
        }

        '13' { Invoke-Sub 'scripts\setup.ps1' }

        '0'  { exit 0 }

        default { Warn 'Неизвестный пункт'; Start-Sleep 1 }
    }
}