# Развёртывание

## Локально

См. [local-setup.md](./local-setup.md).

## На VPS

Два скрипта в корне проекта:

| Скрипт | Что делает | БД |
|---|---|---|
| `deploy.ps1` | Полный деплой: сборка → доставка → **пересоздание БД** → миграции → запуск | Пересоздаётся |
| `deploy_up.ps1` | То же, но **без сброса БД** — только миграции и перезапуск app | Сохраняется |

Используй `deploy.ps1` при первом деплое и при смене схемы, требующей
чистой БД. Дальше — `deploy_up.ps1`.

### Требования

- Локально: Docker Desktop, SSH-ключ к VPS без пароля.
- На VPS: Docker ≥ 24.

### Запуск

```powershell
cd F:\hhru
powershell -ExecutionPolicy Bypass -File .\deploy_up.ps1
```

Скрипт:

1. Собирает два образа: `fsp-hhru:latest` (app) и
   `fsp-ollama-tunnel:latest`.
2. `docker save` в `tar`, копирует по `scp` в `/home/PRANG/docker/`.
3. `docker load` на VPS, останавливает старые контейнеры.
4. Поднимает `fsp-postgres` (для `deploy_up` — стартует существующий).
5. Поднимает `fsp-ollama-tunnel` (всегда пересоздаётся — stateless).
6. Прогоняет `npm run migrate:up` в отдельном one-shot контейнере
   `fsp-migrate`.
7. Поднимает `fsp-app` с `--memory=320m --cpus=0.5`.
8. Чистит временный `tar` и локальные слои.

### Параметры (шапка `deploy.ps1`)

| Параметр | Значение |
|---|---|
| `ProjectPath` | `F:\hhru` |
| `VpsHost` | `31.185.105.155` |
| `VpsDockerDir` | `/home/PRANG/docker` |
| `ImageName` | `fsp-hhru:latest` |
| `TunnelImage` | `fsp-ollama-tunnel:latest` |
| `ContainerName` | `fsp-app` |
| `ContainerPostgres` | `fsp-postgres` |
| `ContainerTunnel` | `fsp-ollama-tunnel` |
| `ContainerMigrate` | `fsp-migrate` |
| `NetworkName` | `fsp-net` |
| `PortMapping` | `80:8080` (наружу 80 → внутрь nginx на 8080) |
| `TunnelPortMapping` | `4010:4010` (WS-порт для клиента Ollama) |
| `MemoryLimit` | `320m` |
| `CpuLimit` | `0.5` |

### Секреты

Источник — `.deploy-secrets.json` (gitignored), генерируется
автоматически при первом запуске `deploy.ps1`. Поля:

```json
{
  "POSTGRES_PASSWORD":  "...",
  "JWT_ACCESS_SECRET":  "...",
  "JWT_REFRESH_SECRET": "...",
  "TUNNEL_SECRET":      "...",
  "generated_at":       "2026-10-09T18:40:06.3234191+03:00"
}
```

Ротация секретов:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -RotateSecrets
```

⚠️ Все ранее выданные JWT становятся невалидными. БД **не** сбрасывается,
только секреты.

### Туннель Ollama

После `deploy.ps1` на VPS поднимается контейнер `fsp-ollama-tunnel`:

- `:4010` — WebSocket-порт, к нему подключается клиент с домашнего ПК;
- `:11434` — HTTP-фасад Ollama для `fsp-app`.

На домашнем ПК запусти:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-tunnel.ps1
```

Скрипт берёт `TUNNEL_SECRET` из `.deploy-secrets.json` или `.env`,
автоматически поднимает локальную Ollama и открывает WS к VPS.

## Docker Compose (альтернатива)

```bash
docker compose up -d
docker compose logs -f app
docker compose down
```

Собирает все четыре сервиса: `postgres`, `ollama-tunnel`, `migrate`,
`fsp-app`.

## Окружения

| Окружение | Назначение | БД | LLM |
|---|---|---|---|
| `dev` | Локально | PG в Docker | Ollama / Mock |
| `staging` | VPS для проверки | PG в Docker | YandexGPT |
| `prod` | Реальный | Управляемый PG | YandexGPT |

## Переменные окружения

См. `.env.example`. Основные:

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `NODE_ENV` | режим работы | `production` |
| `PORT` | порт Express | `3000` |
| `NODE_OPTIONS` | лимит heap | `--max-old-space-size=192` |
| `DATABASE_URL` | строка подключения к PG | — |
| `JWT_ACCESS_SECRET` | секрет access-токена (≥32 символа) | — |
| `JWT_REFRESH_SECRET` | секрет refresh-токена (≥32 символа) | — |
| `JWT_ACCESS_TTL` | срок access-токена | `15m` (можно `1h`) |
| `JWT_REFRESH_TTL` | срок refresh-токена | `30d` |
| `KEYCLOAK_ENABLED` | флаг интеграции с ФСП ID | `false` |
| `KEYCLOAK_URL` / `KEYCLOAK_REALM` / `KEYCLOAK_CLIENT_ID` | Keycloak | — |
| `OLLAMA_URL` | URL Ollama или фасад туннеля | `http://ollama-tunnel:11434` |
| `LLM_MODE` | `pool` / `hybrid` / `generate` | `hybrid` |
| `LLM_PROVIDER` | `auto` / `ollama` / `yandex` / `giga` / `openai` / `mock` | `auto` |
| `LLM_MODEL` | модель Ollama | `llama3.1:8b` |
| `LLM_TIMEOUT_MS` | таймаут запроса к LLM | `60000` |
| `LLM_TEMPERATURE` | температура генерации | `0.7` |
| `TUNNEL_SECRET` | общий секрет VPS ↔ домашний ПК | — |
| `POSTGRES_PASSWORD` | пароль PostgreSQL | — |

## Миграции

Запускаются **отдельным job'ом перед** деплоем app:

```bash
npm run migrate:up
```

Правила безопасных миграций — в [data-model.md](./data-model.md).

| Команда | Что делает |
|---|---|
| `npm run migrate:up` | Применить все pending-миграции |
| `npm run migrate:down` | Откатить последнюю |
| `npm run migrate:create -- name` | Создать новый файл миграции |

## Откат

- Образ: `docker run fsp-hhru:<предыдущий-тег>` — предыдущий образ
  остаётся в локальном `docker images` до `docker image prune`.
- БД: `npm run migrate:down` для последней миграции.
- Для сложных случаев — из бэкапа `pg_dump`.

## Проверка после деплоя

```powershell
# 1. Что контейнеры живы
ssh root@31.185.105.155 'docker ps -a | grep fsp'

# 2. Что переменные окружения попали
ssh root@31.185.105.155 'docker exec fsp-app printenv | grep -E "JWT_|LLM_|OLLAMA"'

# 3. Health и readiness
curl http://31.185.105.155/health
curl http://31.185.105.155/ready

# 4. LLM-статус
curl http://31.185.105.155/api/v1/ai/status

# 5. Логи app
ssh root@31.185.105.155 'docker logs --tail=200 fsp-app'
```