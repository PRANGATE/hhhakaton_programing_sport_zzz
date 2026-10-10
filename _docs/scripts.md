# Скрипты развёртывания и обслуживания

Все скрипты — PowerShell. Работают из Windows, управляют VPS через SSH.
Один раз на новом ПК: `scripts/setup.ps1`. Дальше — `scripts/menu.ps1`.

---

## TL;DR

```powershell
# Первичная настройка (один раз)
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1

# Дальше — меню
powershell -ExecutionPolicy Bypass -File .\scripts\menu.ps1
```

Меню само подсказывает. Если хочется напрямую — см. карту ниже.

---

## Карта скриптов

| Скрипт | Что делает | Когда |
|---|---|---|
| `scripts/setup.ps1` | Создаёт `.deploy-config.json`, `.deploy-secrets.json`, `.env` | Один раз на новом ПК |
| `scripts/menu.ps1` | Интерактивное меню | Для рутины |
| `scripts/doctor.ps1` | Диагностика: инструменты, SSH, контейнеры, health с ретраями | Когда не работает |
| `scripts/status.ps1` | Статус + метрики. `-Logs` — логи | «Что там на сервере?» |
| `scripts/rotate.ps1` | Ротация секретов (`-What db\|jwt\|tunnel\|all`) | Планово / после утечки |
| `scripts/fix-tunnel.ps1` | Пересоздать контейнер туннеля с актуальным `TUNNEL_SECRET` | Туннель отбивает клиента кодом 4001 |
| `scripts/backup.ps1` | Бэкап БД. `-Restore <файл\|latest>` — восстановление | Перед рискованными операциями |
| `scripts/start-tunnel.ps1` | Поднимает клиент Ollama-туннеля | Когда LLM не отвечает |
| `scripts/stop-tunnel.ps1` | Останавливает клиент туннеля | Если больше не нужен |
| `scripts/gen-env.ps1` | Генерирует/обновляет `.env` | Редко |
| `scripts/reset-db.ps1` | Локальный `docker compose down -v && up -d` | Только локальная разработка |
| `scripts/debug-llm.js` | Диагностика LLM | Если генерация не работает |
| `deploy.ps1` | Полный деплой **со сбросом БД** | Первый раз / смена схемы |
| `deploy_up.ps1` | Деплой **без сброса БД** | 99% обновлений |

---

## Файлы конфигурации

Оба — в корне проекта, оба в `.gitignore`.

### `.deploy-config.json`

```json
{
  "project_path":        "F:\\hhru",
  "vps_user":            "root",
  "vps_host":            "31.185.105.155",
  "vps_docker_dir":      "/home/PRANG/docker",
  "container_app":       "fsp-app",
  "container_postgres":  "fsp-postgres",
  "container_tunnel":    "fsp-ollama-tunnel",
  "container_migrate":   "fsp-migrate",
  "network_name":        "fsp-net",
  "image_name":          "fsp-hhru",
  "image_tag":           "latest",
  "tunnel_image":        "fsp-ollama-tunnel:latest",
  "port_mapping":        "80:8080",
  "tunnel_port_mapping": "4010:4010",
  "memory_limit":        "320m",
  "cpu_limit":           "0.5",
  "postgres_user":       "fsp",
  "postgres_db":         "fsp"
}
```

Если файла нет — все скрипты работают на дефолтах. Единственное
назначение — переопределить адрес VPS или параметры контейнеров.
Создаётся `scripts\setup.ps1`.

### `.deploy-secrets.json`

```json
{
  "POSTGRES_PASSWORD":  "...",
  "JWT_ACCESS_SECRET":  "...",
  "JWT_REFRESH_SECRET": "...",
  "TUNNEL_SECRET":      "...",
  "generated_at":       "2026-10-09T18:40:06.3234191+03:00",
  "rotated_at":         "2026-10-10T03:00:00.0000000+03:00"
}
```

**Синхронизация с VPS:** секреты живут в двух местах — в этом файле и
в переменных окружения контейнеров. Локальный файл — источник правды.
Синхронизация происходит **только** через `deploy.ps1` /
`deploy_up.ps1` / `fix-tunnel.ps1` / `rotate.ps1`. Если правишь файл
руками — обязательно передеплой.

---

## Сценарии

### Чистая установка

```powershell
git clone <repo> F:\hhru
cd F:\hhru
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\menu.ps1
```

`setup.ps1`:

1. Проверит docker, ssh, node.
2. Спросит `VpsHost`, `VpsUser`, `VpsDockerDir`.
3. Сгенерирует 4 секрета.
4. Создаст `.deploy-config.json`, `.deploy-secrets.json`, `.env`.
5. Проверит SSH к VPS.

### Обновление без стирания данных

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy_up.ps1
```

Собирает образ, копирует по SCP, прогоняет миграции, перезапускает
app. БД не трогает.

### Диагностика

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor.ps1
```

Проверит: docker (локально), ssh, node, конфиг, секреты, доступ к VPS,
каждый контейнер, три health-эндпоинта (с ретраями — 3 попытки по 2 сек).
В конце — список провалов и предупреждений.

Exit-код: количество провалов. Предупреждения (WarnOnly) не влияют.

Что считается предупреждением:

- `.deploy-config.json` отсутствует — работаем на дефолтах.
- `Ollama (локально)` не найдена — не критично для деплоя.
- `AI /ai/health` не отвечает — туннель не поднят, fallback на пул.

### Логи

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\status.ps1 -Logs -Follow
```

Только app:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\status.ps1 -Logs -Follow -Container fsp-app
```

Ctrl+C — выйти.

### Смена пароля БД

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\rotate.ps1 -What db
```

Что происходит:

1. `SELECT 1` — проверка связи с psql.
2. `ALTER USER fsp WITH PASSWORD '...'` через here-doc (надёжнее, чем
   `-c "SQL"` при прокидывании через ssh + bash).
3. Проверка, что **новый** пароль реально работает (`SELECT 1` с
   новым паролем).
4. Обновление `.deploy-secrets.json`.
5. `gen-env.ps1 -Rotate` — обновление `.env`.
6. `deploy_up.ps1` — пересборка и перезапуск app.

**Downtime:** ~30 секунд.

Полезные флаги:

- `-SkipDeploy` — не пересобирать app, только секреты.
- `-Force` — без подтверждения.

### Смена JWT

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\rotate.ps1 -What jwt
```

Все активные сессии станут недействительными — пользователи залогинятся
заново.

### Смена TUNNEL_SECRET

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\rotate.ps1 -What tunnel
```

После этого надо перезапустить клиент туннеля на домашнем ПК:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-tunnel.ps1
```

### Смена всего

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\rotate.ps1 -What all
```

Или через меню: пункт 6.

### Пересоздать контейнер туннеля (фикс 4001)

Если клиент туннеля циклически переподключается с кодом **4001**, значит
`TUNNEL_SECRET` на клиенте не совпадает с тем, что в контейнере на VPS.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\fix-tunnel.ps1
```

Скрипт:

1. Читает `TUNNEL_SECRET` из `.deploy-secrets.json`.
2. Показывает текущее значение в контейнере на VPS.
3. Если они уже совпадают — выходит без изменений.
4. Если разные — останавливает, удаляет и пересоздаёт контейнер
   `fsp-ollama-tunnel` с актуальным секретом.
5. Проверяет, что новое значение реально записалось.

Образ `fsp-ollama-tunnel:latest` **не пересобирается** — используется
тот, что уже лежит на VPS. Занимает 2 секунды.

После фикса — перезапусти `scripts\start-tunnel.ps1` на домашнем ПК.

### Бэкап БД

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1
```

Дамп положится в `backups\fsp-2026-10-10_03-30-00.sql.gz`.

Флаг `-KeepRemote` — оставить копию на VPS в `/tmp/` (по умолчанию
удаляется).

### Восстановление

```powershell
# из конкретного файла
powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1 -Restore .\backups\fsp-2026-10-10_03-30-00.sql.gz

# самый свежий
powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1 -Restore latest
```

**Удалит** текущую БД и зальёт из дампа. Спросит подтверждение.

Через меню пункт **8** — покажет список доступных бэкапов с номерами,
даст выбрать.

### Запуск Ollama-туннеля

На домашнем ПК, где стоит Ollama:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-tunnel.ps1
```

Скрипт:

1. Читает `TUNNEL_SECRET` из `.deploy-secrets.json`.
2. Читает `vps_host` из `.deploy-config.json`.
3. Проверяет Ollama на `127.0.0.1:11434`.
4. Запускает `tunnel/client.js`.

Оставь окно открытым. Ctrl+C — остановить.

Если в логе видишь `соединение закрыто (код 4001)` — см. `fix-tunnel.ps1`.

### Остановка туннеля

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-tunnel.ps1
```

Найдёт все `node ... tunnel\client.js` и убьёт их.

---

## Меню (`scripts\menu.ps1`)

| Пункт | Что |
|---|---|
| 1 | Диагностика окружения |
| 2 | Деплой без сброса БД |
| 3 | Деплой со сбросом БД (с подтверждением) |
| 4 | Статус контейнеров |
| 5 | Логи (live tail) |
| 6 | Ротация секретов |
| 7 | Бэкап БД |
| 8 | Восстановить БД (интерактивный выбор из `backups\`) |
| 9 | Запустить Ollama-туннель |
| 10 | Остановить Ollama-туннель |
| 11 | Показать `.deploy-config.json` (в консоль + опционально notepad) |
| 12 | Показать `.deploy-secrets.json` |
| 13 | Первичная настройка (setup) |
| 0 | Выход |

Пункты 11 и 12 работают даже если файла нет — предложат создать через
`setup.ps1`.

---

## Устранение неполадок

### SSH к VPS не работает

```powershell
ssh root@31.185.105.155 'echo ok'
```

Если просит пароль — настрой ключ:

```powershell
ssh-copy-id root@31.185.105.155
```

### Контейнер `fsp-postgres` не в running

```powershell
powershell -File .\scripts\status.ps1 -Logs -Container fsp-postgres -Tail 200
```

После сброса БД контейнеру нужно 5–10 секунд на initdb.

### Health /health DOWN

App не поднялся. Возможные причины:

1. Порт занят — проверь `docker ps`.
2. Миграции упали — смотри `fsp-migrate`.
3. OOM — увеличь `memory_limit` в `.deploy-config.json`.

```powershell
powershell -File .\scripts\status.ps1 -Logs -Container fsp-app -Tail 200
```

### AI /ai/health DOWN

LLM недоступна. Проверь:

1. На домашнем ПК запущен `scripts\start-tunnel.ps1`?
2. Ollama отвечает на `127.0.0.1:11434/api/tags`?
3. Tunnel-контейнер в running?

```powershell
powershell -File .\scripts\status.ps1 -Logs -Container fsp-ollama-tunnel -Tail 100
```

**Важно:** если LLM лежит, тесты всё равно работают — `LLM_MODE=hybrid`
переключается на пул эталонных заданий.

### Клиент туннеля циклически переподключается с кодом 4001

**`TUNNEL_SECRET` на клиенте не совпадает с тем, что в контейнере на
VPS.** Обычно — после ручной правки `.deploy-secrets.json` или после
`setup.ps1` без передеплоя.

Проверить:

```powershell
# Что локально
(Get-Content .\.deploy-secrets.json -Raw | ConvertFrom-Json).TUNNEL_SECRET

# Что в контейнере
ssh root@31.185.105.155 "docker exec fsp-ollama-tunnel printenv TUNNEL_SECRET"
```

Если разные — фикс:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\fix-tunnel.ps1
```

### `password authentication failed for user "fsp"` при деплое

Пароль в БД и `.deploy-secrets.json` разъехались. Обычно — после падения
`rotate.ps1` на `ALTER USER` до `Save-Secrets`.

**Лечение:**

1. Если данные в БД не нужны — запусти `deploy.ps1` (пересоздаст БД
   с актуальным паролем).
2. Если данные нужны — руками приведи пароль в БД к тому, что в
   `.deploy-secrets.json`:

```powershell
$cfg = Get-Content .\.deploy-config.json -Raw | ConvertFrom-Json
$sec = Get-Content .\.deploy-secrets.json -Raw | ConvertFrom-Json
$target = "$($cfg.vps_user)@$($cfg.vps_host)"
ssh $target "docker exec fsp-postgres psql -U fsp -d fsp -c `"ALTER USER fsp WITH PASSWORD '$($sec.POSTGRES_PASSWORD)';`""
```

Потом `deploy_up.ps1`.

### Ротация упала на ALTER USER

Если `rotate.ps1` упал — **ничего не сохранено**, `.deploy-secrets.json`
не тронут. Проверь доступ к psql вручную:

```powershell
ssh root@31.185.105.155 "docker exec fsp-postgres psql -U fsp -d fsp -tAc 'SELECT 1'"
```

Если работает — просто перезапусти `rotate.ps1`. Если не работает —
пароль разъехался, см. раздел выше.

### Access-токен живёт 15 минут

Это дефолт из `JWT_ACCESS_TTL`. Увеличить до часа:

1. В `deploy.ps1` и `deploy_up.ps1` найди `"JWT_ACCESS_TTL=15m"` —
   замени на `"JWT_ACCESS_TTL=1h"`.
2. В `docker-compose.yml` — `JWT_ACCESS_TTL: "1h"`.
3. В `.env` и `.env.example` — `JWT_ACCESS_TTL=1h`.
4. `deploy_up.ps1`.

Фронт не умеет автообновлять токен — час это максимум, что имеет смысл
ставить без доработок.

---

## Что НЕ умеют текущие скрипты

- **Автоматические бэкапы.** `backup.ps1` — только ручной.
  Post-MVP: `cron` на VPS.
- **Rollback к предыдущей сборке.** В планах — `rollback.ps1`.
- **Auto-refresh JWT на фронте.** Токен истекает — выкидывает на `/`.
- **Мониторинг.** Prometheus + Telegram-алерты — Post-MVP.

---

## Безопасность

- `.deploy-config.json` и `.deploy-secrets.json` — в `.gitignore`.
  Не коммитить.
- Дефолтный `admin@ad.min` / `1` — только для прототипа.
- Ротацию JWT делать планово раз в квартал или при подозрении на утечку.
- Бэкапы содержат персональные данные → хранить на шифрованном диске.

## См. также

- [scripts-quickstart.md](./scripts-quickstart.md) — «инструкция для тупых»:
  что установить на компьютер и какие скрипты запускать.