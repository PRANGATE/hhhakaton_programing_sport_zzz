# Локальный запуск

## Требования

- Node.js ≥ 20
- Docker Desktop (для варианта с Docker)
- Git

## Вариант 1. Docker

```bash
git clone git@github.com:PRANGATE/hhhakaton_programing_sport_zzz.git
cd hhhakaton_programing_sport_zzz
docker build -t fsp-hhru:latest .
docker run --rm -p 3000:3000 fsp-hhru:latest
```

Открыть: <http://localhost:3000>

## Вариант 2. Docker Compose

```bash
docker compose up -d
docker compose logs -f app
```

Остановить: `docker compose down`

## Вариант 3. Без Docker

```bash
npm install
cp .env.example .env
npm start
```

## Переменные окружения

`.env.example` содержит шаблон. Копируй в `.env` и правь.

```env
NODE_ENV=development
PORT=3000

# Keycloak (по умолчанию выключен)
KEYCLOAK_ENABLED=false
KEYCLOAK_URL=https://id.fsp.example
KEYCLOAK_REALM=fsp
KEYCLOAK_CLIENT_ID=fsp-web

# LLM
LLM_PROVIDER=ollama
LLM_DAILY_BUDGET_RUB=100
```

## Полезные команды

```bash
npm run dev              # запуск с watch
npm run migrate:up       # миграции БД
npm test                 # unit-тесты
```

## Проверка

- `/health` → `{ "ok": true }`
- `/api/config` → настройки фронта
- Открыть `/` → страница входа