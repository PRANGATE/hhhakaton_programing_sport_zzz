# scripts/doctor.ps1
# Диагностика окружения.
[CmdletBinding()]
param([switch]$Quiet)
. "$PSScriptRoot\_lib.ps1"

$root = Get-ProjectRoot -Start $PSScriptRoot
$results = [System.Collections.Generic.List[object]]::new()

function Check {
    param([string]$Name, [scriptblock]$Body, [switch]$WarnOnly)
    try {
        $ok = [bool](& $Body)
        $results.Add([pscustomobject]@{
            Name     = $Name
            Ok       = $ok
            WarnOnly = [bool]$WarnOnly
            Error    = $null
        })
        if (-not $Quiet) {
            if ($ok) { Ok $Name } else { Warn $Name }
        }
    } catch {
        $results.Add([pscustomobject]@{
            Name     = $Name
            Ok       = $false
            WarnOnly = [bool]$WarnOnly
            Error    = $_.Exception.Message
        })
        if (-not $Quiet) { Fail "$Name — $($_.Exception.Message)" }
    }
}

# Health с ретраями: 3 попытки по 2 секунды.
function Check-HealthEndpoint {
    param(
        [string]$Name,
        [string]$Target,
        [string]$Url,
        [int]$Attempts = 3,
        [int]$SleepSec = 2
    )
    for ($i = 1; $i -le $Attempts; $i++) {
        $body = Invoke-RemoteCapture $Target "curl -s --max-time 5 $Url"
        if ($body -match '"ok"\s*:\s*true') {
            $results.Add([pscustomobject]@{ Name = $Name; Ok = $true; WarnOnly = $false; Error = $null })
            if (-not $Quiet) { Ok "$Name (попытка $i)" }
            return
        }
        if ($i -lt $Attempts) { Start-Sleep -Seconds $SleepSec }
    }
    $results.Add([pscustomobject]@{
        Name = $Name; Ok = $false; WarnOnly = $false
        Error = "не ответил за $Attempts попыток"
    })
    if (-not $Quiet) { Warn "$Name — не ответил за $Attempts попыток" }
}

Info "Корень проекта: $root"
Write-Host ''

Check 'Docker (локально)' { [bool](Get-Command docker -ErrorAction SilentlyContinue) }
Check 'SSH-клиент'        { [bool](Get-Command ssh -ErrorAction SilentlyContinue) }
Check 'Node.js ≥ 20' {
    $v = & node --version 2>$null
    if (-not $v) { return $false }
    ([int](($v -replace '^v','') -split '\.')[0]) -ge 20
}
Check 'Ollama (локально)'    { [bool](Get-Command ollama -ErrorAction SilentlyContinue) } -WarnOnly
Check 'Dockerfile в корне'   { Test-Path (Join-Path $root 'Dockerfile') }
Check '.deploy-config.json'  { Test-Path (Join-Path $root '.deploy-config.json') } -WarnOnly
Check '.deploy-secrets.json' { Test-Path (Join-Path $root '.deploy-secrets.json') }
Check '.env'                 { Test-Path (Join-Path $root '.env') }

$cfg = $null
try { $cfg = Get-DeployConfig -ProjectRoot $root } catch {}

if ($cfg) {
    Write-Host ''
    Info "VPS: $($cfg.vps_user)@$($cfg.vps_host)"
    $target = "$($cfg.vps_user)@$($cfg.vps_host)"

    Check 'SSH-доступ к VPS' { Test-SshConnection $target }
    Check 'Docker на VPS'    { Test-DockerOnVps $target }

    foreach ($c in @($cfg.container_app, $cfg.container_postgres, $cfg.container_tunnel)) {
        $name = $c
        Check "Контейнер $name" {
            $state = Invoke-RemoteCapture $target "docker inspect --format='{{.State.Status}}' $name 2>/dev/null"
            return ($state -match 'running')
        }
    }

    Write-Host ''
    Info 'Health-эндпоинты (с ретраями)'

    Check-HealthEndpoint -Name 'Health /health'     -Target $target -Url 'http://127.0.0.1/health'
    Check-HealthEndpoint -Name 'Ready /ready'       -Target $target -Url 'http://127.0.0.1/ready'
    Check-HealthEndpoint -Name 'AI /ai/health'      -Target $target -Url 'http://127.0.0.1/api/v1/ai/health'

    # Если AI DOWN — предупредим, что это WarnOnly
    $aiResult = $results | Where-Object { $_.Name -eq 'AI /ai/health' } | Select-Object -First 1
    if ($aiResult -and -not $aiResult.Ok) {
        $aiResult.WarnOnly = $true
    }
}

Write-Host ''

$failedItems = @($results | Where-Object { $_.Ok -eq $false -and -not $_.WarnOnly })
$warnItems   = @($results | Where-Object { $_.Ok -eq $false -and $_.WarnOnly })
$passed      = @($results | Where-Object { $_.Ok -eq $true }).Count
$total       = $results.Count

if ($failedItems.Count -eq 0 -and $warnItems.Count -eq 0) {
    Ok "Все проверки пройдены: $passed/$total"
} elseif ($failedItems.Count -eq 0) {
    Ok "Пройдено: $passed/$total. Предупреждений: $($warnItems.Count)"
    Write-Host ''
    foreach ($item in $warnItems) {
        $err = if ($item.Error) { " — $($item.Error)" } else { '' }
        Write-Host "  ! $($item.Name)$err" -ForegroundColor DarkYellow
    }
} else {
    Warn "Провалено: $($failedItems.Count) из $total. Предупреждений: $($warnItems.Count)."
    Write-Host ''
    foreach ($item in $failedItems) {
        $err = if ($item.Error) { " — $($item.Error)" } else { '' }
        Write-Host "  - $($item.Name)$err" -ForegroundColor Yellow
    }
    foreach ($item in $warnItems) {
        $err = if ($item.Error) { " — $($item.Error)" } else { '' }
        Write-Host "  ! $($item.Name)$err" -ForegroundColor DarkYellow
    }
}

exit $failedItems.Count