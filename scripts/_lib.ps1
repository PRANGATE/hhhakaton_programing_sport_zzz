# scripts/_lib.ps1
# Общая библиотека. Подключается через:
#   . "$PSScriptRoot\_lib.ps1"

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK: $m"  -ForegroundColor Green }
function Warn($m) { Write-Host "!! $m"   -ForegroundColor Yellow }
function Fail($m) { Write-Host "ERR: $m" -ForegroundColor Red }

# ---------- Корень проекта ----------
function Get-ProjectRoot {
    param([string]$Start = $PSScriptRoot)
    $candidates = @()
    if ($Start) {
        $candidates += (Join-Path $Start '..')
        $candidates += $Start
    }
    $candidates += (Get-Location).Path
    foreach ($c in $candidates) {
        try {
            $full = (Resolve-Path -LiteralPath $c -ErrorAction Stop).Path
            if ((Test-Path -LiteralPath (Join-Path $full 'Dockerfile')) -or
                (Test-Path -LiteralPath (Join-Path $full '.env.example'))) {
                return $full
            }
        } catch { }
    }
    throw 'Не удалось найти корень проекта (Dockerfile / .env.example).'
}

# ---------- Конфиг ----------
function Get-DeployConfig {
    param([string]$ProjectRoot)

    $defaults = [ordered]@{
        project_path        = $ProjectRoot
        vps_user            = 'root'
        vps_host            = '31.185.105.155'
        vps_docker_dir      = '/home/PRANG/docker'
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

    $values = @{}
    foreach ($k in $defaults.Keys) { $values[$k] = $defaults[$k] }

    $path = Join-Path $ProjectRoot '.deploy-config.json'
    if (Test-Path -LiteralPath $path) {
        try {
            $fromFile = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($fromFile) {
                foreach ($p in $fromFile.PSObject.Properties) {
                    if ($p.Name) { $values[$p.Name] = $p.Value }
                }
            }
        } catch {
            Warn "Не удалось прочитать $path : $($_.Exception.Message). Использую дефолты."
        }
    }
    return [pscustomobject]$values
}

# ---------- Секреты ----------
function Load-Secrets {
    param([string]$ProjectRoot)
    $p = Join-Path $ProjectRoot '.deploy-secrets.json'
    if (-not (Test-Path -LiteralPath $p)) {
        throw "Не найден $p. Запусти scripts\setup.ps1"
    }
    return Get-Content -LiteralPath $p -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Save-Secrets {
    param([string]$ProjectRoot, [pscustomobject]$Secrets)
    $p = Join-Path $ProjectRoot '.deploy-secrets.json'
    $Secrets | ConvertTo-Json | Set-Content -LiteralPath $p -Encoding UTF8
}

# ---------- Генератор секретов ----------
function New-Secret {
    param([int]$Length = 48)
    $alphabet = (48..57) + (65..90) + (97..122) + @(45, 95)
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    -join ($bytes | ForEach-Object { [char]$alphabet[$_ % $alphabet.Length] })
}

# ---------- SSH ----------
function Test-SshConnection {
    param([string]$Target, [int]$TimeoutSec = 8)
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        $null = & ssh -o BatchMode=yes -o ConnectTimeout=$TimeoutSec $Target 'echo ok' 2>&1
        return ($LASTEXITCODE -eq 0)
    } finally { $ErrorActionPreference = $prev }
}

function Invoke-Remote {
    param([string]$Target, [string[]]$Commands, [switch]$IgnoreErrors)
    $script = ($Commands -join "`n") + "`n"
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        $script | & ssh $Target "tr -d '\r' | bash -s"
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $prev }
    if ($code -ne 0 -and -not $IgnoreErrors) { throw "Remote команда упала (exit $code)" }
    return $code
}

function Invoke-RemoteCapture {
    param([string]$Target, [string]$Command)
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        $out = & ssh $Target $Command 2>&1
        return ($out -join "`n")
    } finally { $ErrorActionPreference = $prev }
}

function Test-DockerOnVps {
    param([string]$Target)
    return ((Invoke-RemoteCapture $Target 'docker --version') -match 'Docker version')
}

# ---------- Файлы конфигов ----------
# Показать JSON в консоли и опционально открыть в notepad.
function Show-JsonFile {
    param([string]$Path, [string]$Title)
    if (-not (Test-Path -LiteralPath $Path)) {
        Warn "Нет файла: $Path"
        return
    }
    if (-not $Title) { $Title = Split-Path -Leaf $Path }
    Info "Содержимое $Title"
    Write-Host ''
    Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | Write-Host
    Write-Host ''
    if (Confirm-Yes 'Открыть в notepad?') {
        Start-Process notepad.exe -ArgumentList $Path | Out-Null
    }
}

# ---------- Утилиты ввода ----------
function Read-HostDefault {
    param([string]$Prompt, [string]$Default)
    $raw = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
    return $raw.Trim()
}

function Confirm-Yes {
    param([string]$Prompt = 'Продолжить?')
    return ((Read-Host "$Prompt (yes/no)") -eq 'yes')
}

function Assert-SshTarget {
    param([string]$Target)
    if (-not (Test-SshConnection $Target)) { throw "Нет SSH-доступа к $Target" }
}