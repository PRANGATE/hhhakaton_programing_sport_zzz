# scripts/start-tunnel.ps1
# Запускает клиент туннеля на домашнем ПК.
[CmdletBinding()]
param(
    [string]$ProjectPath,
    [string]$VpsHost,
    [int]   $VpsPort  = 4010,
    [string]$LlmModel = 'llama3.1:8b'
)

. "$PSScriptRoot\_lib.ps1"

if (-not $ProjectPath) { $ProjectPath = Get-ProjectRoot -Start $PSScriptRoot }
$cfg = Get-DeployConfig -ProjectRoot $ProjectPath
if (-not $VpsHost) { $VpsHost = $cfg.vps_host }

Info "Корень проекта: $ProjectPath"
Info "VPS: $VpsHost"

$sec = Load-Secrets -ProjectRoot $ProjectPath
if (-not $sec.TUNNEL_SECRET) { throw 'В .deploy-secrets.json нет TUNNEL_SECRET.' }
Ok 'TUNNEL_SECRET загружен'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node не найден в PATH. Установи Node.js ≥ 20.'
}

$ollamaOk = $false
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 -UseBasicParsing
    $ollamaOk = ($r.StatusCode -eq 200)
} catch { $ollamaOk = $false }

if ($ollamaOk) { Ok 'Ollama отвечает на 127.0.0.1:11434' }
else { Warn 'Ollama не отвечает. Клиент попробует запустить её сам.' }

$env:VPS_TUNNEL_URL = "ws://${VpsHost}:${VpsPort}/ollama-tunnel"
$env:TUNNEL_SECRET  = $sec.TUNNEL_SECRET
$env:LLM_MODEL      = $LlmModel

Write-Host ''
Info "VPS_TUNNEL_URL = $env:VPS_TUNNEL_URL"
Info "LLM_MODEL      = $env:LLM_MODEL"
Write-Host ''

$clientPath = Join-Path $ProjectPath 'tunnel\client.js'
if (-not (Test-Path -LiteralPath $clientPath)) { throw "Не найден $clientPath" }

Ok 'Оставь окно открытым. Ctrl+C — остановить.'
Write-Host ''
node $clientPath