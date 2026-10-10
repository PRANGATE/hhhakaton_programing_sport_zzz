# Runbook

Что делать при типовых инцидентах.

## Приложение не отвечает

1. Проверить контейнер: `docker ps -a`.
2. Логи: `docker logs --tail=200 fsp-app`.
3. Health: `curl -f http://localhost:3000/health`.
4. Если процесс упал — `docker restart fsp-app`.
5. Если перезапуск не помогает — откат к предыдущему образу.

Быстрая проверка через скрипты:

```powershell
powershell -File .\scripts\doctor.ps1
powershell -File .\scripts\status.ps1 -Logs -Container fsp-app -Tail 200
```

## База не подключается

1. Проверить PostgreSQL: `pg_isready`.
2. Проверить переменную `DATABASE_URL`.
3. Соединения: `SELECT count(*) FROM pg_stat_activity;`.
4. Если утечка соединений — `SELECT pg_terminate_backend(pid) FROM ...;`
   для idle.
5. Долгосрочно — включить PgBouncer.

## `password authentication failed for user "fsp"`

Пароль в БД и в `.deploy-secrets.json` разъехались. Обычно происходит
после падения `rotate.ps1` на `ALTER USER` — пароль в БД уже поменялся,
а `Save-Secrets` не выполнился.

**Диагностика:**

```powershell
# Что в secrets
notepad .\.deploy-secrets.json
# (запомни POSTGRES_PASSWORD)

# Что в контейнере (подставь пароль)
ssh root@31.185.105.155 "docker exec -e PGPASSWORD='<пароль>' fsp-postgres psql -U fsp -d fsp -tAc 'SELECT 1'"
```

Если вернёт `password authentication failed` — рассинхрон.

**Лечение:**

Вариант A — данные не нужны, можно снести:

```powershell
powershell -File .\deploy.ps1
```

Вариант B — данные нужны, привести пароль БД к secrets:

```powershell
$cfg = Get-Content .\.deploy-config.json -Raw | ConvertFrom-Json
$sec = Get-Content .\.deploy-secrets.json -Raw | ConvertFrom-Json
$target = "$($cfg.vps_user)@$($cfg.vps_host)"
ssh $target "docker exec fsp-postgres psql -U fsp -d fsp -c `"ALTER USER fsp WITH PASSWORD '$($sec.POSTGRES_PASSWORD)';`""
```

Потом `deploy_up.ps1`.

## LLM не отвечает (`AI /ai/health` DOWN)

1. `/api/v1/ai/status` — расширенный статус.
2. Если таймаут — Matching и Test переключаются в fallback автоматически.
3. Проверить баланс провайдера.
4. Если провайдер лежит — временно переключить `LLM_PROVIDER` на резервный.

**С туннелем Ollama:**

```powershell
# Проверить health
curl http://31.185.105.155/api/v1/ai/health
curl http://31.185.105.155/api/v1/ai/status
```

Если `ok: false` — на домашнем ПК запущен ли `scripts\start-tunnel.ps1`?

```powershell
powershell -File .\scripts\status.ps1 -Logs -Container fsp-ollama-tunnel -Tail 100
```

Если контейнер живой, а health всё равно DOWN — проверь Ollama на
домашнем ПК:

```powershell
curl http://127.0.0.1:11434/api/tags
```

**Помни:** при недоступной LLM платформа работает в режиме пула —
вопросы берутся из 10 эталонных заданий. Fallback автоматический,
`LLM_MODE=hybrid`.

## Клиент туннеля циклически переподключается с кодом 4001

**`TUNNEL_SECRET` на клиенте не совпадает с тем, что в контейнере на
VPS.** Код 4001 = `forbidden` = неверный `x-tunnel-secret` в handshake.

Обычно происходит после:

- Ручной правки `.deploy-secrets.json`.
- Запуска `setup.ps1` без передеплоя.
- Неудавшегося `rotate.ps1`.

**Диагностика:**

```powershell
# Что локально
(Get-Content .\.deploy-secrets.json -Raw | ConvertFrom-Json).TUNNEL_SECRET

# Что в контейнере на VPS
ssh root@31.185.105.155 "docker exec fsp-ollama-tunnel printenv TUNNEL_SECRET"

# Логи клиента — там будет видно код 4001
# (в окне start-tunnel.ps1)
```

Если значения разные — фикс:

```powershell
powershell -File .\scripts\fix-tunnel.ps1
```

Скрипт пересоздаст контейнер с актуальным секретом. Образ
`fsp-ollama-tunnel:latest` не пересобирается, занимает 2 секунды.

После фикса — перезапусти `scripts\start-tunnel.ps1` на домашнем ПК.

## Много 5xx

1. Метрики: доля по маршрутам, `error rate`.
2. Логи: `grep '"level":"error"' | tail`.
3. Проверить БД и внешние сервисы.
4. Если связан с конкретным эндпоинтом — feature-flag, отключить.
5. Пост-мортем: описать в `_docs/incidents/<date>.md`.

## Диск заполнен

1. `df -h`.
2. `docker system prune -f`.
3. Логи: `du -sh /var/log/*`.
4. PDF-файлы — вынести в S3.
5. Бэкапы — проверить retention.

## Подозрение на утечку ПДн

1. **Немедленно** отключить эндпоинт или весь сервис.
2. Зафиксировать инцидент: время, кто обнаружил, что утекло.
3. Проверить audit log: кто и куда обращался.
4. Уведомить ответственного за 152-ФЗ.
5. Разбор и обновление политик.

## Что делать после инцидента

1. **Собрать факты**: логи, метрики, время.
2. **Записать** в `_docs/incidents/YYYY-MM-DD-<краткое-описание>.md`.
3. **Проверить**, не повторится ли: добавить проверку в `doctor.ps1`.
4. **Если проблема в скрипте** — поправить, перегенерировать документацию.
5. **Если проблема в конфиге** — уточнить `.deploy-config.json` или
   `.deploy-secrets.json`.