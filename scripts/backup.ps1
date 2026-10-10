# scripts/backup.ps1
# Бэкап БД с VPS + скачивание. -Restore <файл|latest> — восстановление.
[CmdletBinding()]
param(
    [string]$BackupDir,
    [string]$Restore,
    [switch]$KeepRemote
)

. "$PSScriptRoot\_lib.ps1"

$root = Get-ProjectRoot -Start $PSScriptRoot
$cfg  = Get-DeployConfig -ProjectRoot $root
$target = "$($cfg.vps_user)@$($cfg.vps_host)"

Assert-SshTarget $target

if (-not $BackupDir) { $BackupDir = Join-Path $root 'backups' }
if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

# ================= RESTORE =================
if ($Restore) {

    # "latest" → самый свежий дамп
    if ($Restore -eq 'latest') {
        $files = Get-ChildItem -LiteralPath $BackupDir -Filter 'fsp-*.sql.gz' -ErrorAction SilentlyContinue |
                 Sort-Object LastWriteTime -Descending
        if (-not $files -or $files.Count -eq 0) {
            throw "В $BackupDir нет ни одного дампа fsp-*.sql.gz"
        }
        $Restore = $files[0].FullName
        Info "Восстанавливаю из самого свежего: $(Split-Path -Leaf $Restore)"
    }

    if (-not (Test-Path -LiteralPath $Restore)) {
        throw "Не найден дамп: $Restore"
    }

    $file   = (Resolve-Path -LiteralPath $Restore).Path
    $remote = "/tmp/fsp-restore-$(Get-Random).sql"

    if ($file -like '*.gz') {
        Info "Загружаю $file на VPS…"
        & scp $file "${target}:${remote}.gz"
        if ($LASTEXITCODE -ne 0) { throw 'scp упал' }
        Invoke-Remote $target @("gunzip -f '$remote.gz'") | Out-Null
    } else {
        Info "Загружаю $file на VPS…"
        & scp $file "${target}:$remote"
        if ($LASTEXITCODE -ne 0) { throw 'scp упал' }
    }

    Warn 'Сейчас БД будет ОЧИЩЕНА и залита из дампа.'
    if (-not (Confirm-Yes 'Продолжить?')) {
        Invoke-Remote $target @("rm -f '$remote' '$remote.gz'") -IgnoreErrors | Out-Null
        Info 'Отменено'; exit 0
    }

    Info 'Пересоздаю БД и восстанавливаю…'
    Invoke-Remote $target @(
        "docker exec -i $($cfg.container_postgres) psql -U $($cfg.postgres_user) -d postgres -c 'DROP DATABASE IF EXISTS $($cfg.postgres_db) WITH (FORCE);'",
        "docker exec -i $($cfg.container_postgres) psql -U $($cfg.postgres_user) -d postgres -c 'CREATE DATABASE $($cfg.postgres_db);'",
        "docker exec -i $($cfg.container_postgres) psql -U $($cfg.postgres_user) -d $($cfg.postgres_db) < '$remote'"
    ) | Out-Null

    Invoke-Remote $target @("rm -f '$remote'") -IgnoreErrors | Out-Null
    Ok 'БД восстановлена'
    Invoke-Remote $target @("docker restart $($cfg.container_app)") | Out-Null
    Ok 'app перезапущен'
    exit 0
}

# ================= BACKUP =================
$stamp  = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$name   = "fsp-$stamp.sql.gz"
$remote = "/tmp/$name"
$local  = Join-Path $BackupDir $name

Info 'Делаю pg_dump на VPS…'
Invoke-Remote $target @(
    "docker exec $($cfg.container_postgres) pg_dump -U $($cfg.postgres_user) -d $($cfg.postgres_db) | gzip > $remote",
    "ls -lh $remote"
) | Out-Null
Ok "Дамп готов: $remote"

Info "Скачиваю в $local…"
& scp "${target}:$remote" $local
if ($LASTEXITCODE -ne 0) { throw 'scp упал' }
Ok ("Локально: {0:N2} MB" -f ((Get-Item $local).Length / 1MB))

if (-not $KeepRemote) {
    Invoke-Remote $target @("rm -f '$remote'") -IgnoreErrors | Out-Null
    Ok 'Дамп на VPS удалён'
}

Write-Host ''
Ok "Бэкап готов: $local"
Write-Host ''
Write-Host '   Восстановить:' -ForegroundColor DarkGray
Write-Host "   powershell -File .\scripts\backup.ps1 -Restore `"$local`"" -ForegroundColor DarkGray
Write-Host '   Или самый свежий:' -ForegroundColor DarkGray
Write-Host '   powershell -File .\scripts\backup.ps1 -Restore latest' -ForegroundColor DarkGray