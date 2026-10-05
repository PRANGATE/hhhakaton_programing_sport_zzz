# Развёртывание

## Локально

См. [local-setup.md](./local-setup.md).

## На VPS

`deploy.ps1` — сборка локально, доставка по SCP, запуск на сервере.

### Требования

- Локально: Docker Desktop, SSH-ключ к VPS без пароля.
- На VPS: Docker ≥ 24.

### Запуск

```powershell
cd F:\hhru
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

Скрипт:
1. Собирает образ `fsp-hhru:latest`.
2. Сохраняет в `tar`.
3. `scp` на VPS в `/home/PRANG/docker/`.
4. `docker load`, перезапуск контейнера.
5. Чистит временные файлы.

### Переменные

Все параметры — в шапке `deploy.ps1`:

| Параметр | Значение |
|---|---|
| `VpsHost` | `31.185.105.155` |
| `VpsDockerDir` | `/home/PRANG/docker` |
| `ContainerName` | `fsp-app` |
| `PortMapping` | `80:3000` |
| `MemoryLimit` | `256m` |
| `CpuLimit` | `0.5` |

## Docker Compose (прод-вариант)

См. [microservices.md § 11](./microservices.md). Собирает
`nginx`, `app`, `postgres`, `redis`.

```bash
docker compose up -d
docker compose logs -f app
docker compose down
```

## Окружения

| Окружение | Назначение | БД | LLM |
|---|---|---|---|
| `dev` | Локально | SQLite или PG в Docker | Ollama / Mock |
| `staging` | VPS для проверки | PG в Docker | YandexGPT |
| `prod` | Реальный | Управляемый PG | YandexGPT |

## Миграции

Запускаются **отдельным job'ом перед** деплоем app:

```bash
npm run migrate:up
```

Правила безопасных миграций — в [data-model.md](./data-model.md).

## Откат

- Образ: `docker run fsp-hhru:<предыдущий-тег>`.
- БД: `npm run migrate:down` для последней миграции.
- Для сложных случаев — из бэкапа `pg_dump`.