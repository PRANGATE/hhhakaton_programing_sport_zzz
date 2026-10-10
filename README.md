# ФСП · Платформа ИТ-вакансий

Прототип цифровой платформы-агрегатора ИТ-вакансий с верифицированным
профилем достижений участника Федерации спортивного программирования (ФСП).

**Хакатон:** спец. трек ФСП, 2026.

Главная механика — работодатель сам находит категорию кандидатов
(специализация + подтверждённый грейд) и выходит на конкретного человека
с предложением и уровнем зарплаты. Не наоборот, как на обычных job-бордах.

---

## Быстрый старт

### Docker

```bash
docker build -t fsp-hhru:latest .
docker run --rm -p 3000:3000 fsp-hhru:latest
# открыть http://localhost:3000
```

### Без Docker

```bash
npm install
npm start
```

Требуется Node.js ≥ 20.

### Docker Compose

```bash
docker compose up -d
docker compose logs -f app
```

### Деплой на VPS

```powershell
# первый деплой (с пересозданием БД)
powershell -ExecutionPolicy Bypass -File .\deploy.ps1

# обновление без сброса БД
powershell -ExecutionPolicy Bypass -File .\deploy_up.ps1
```

Требуется SSH-ключ без пароля к серверу.

---

## Стек

| Слой | Технология |
|---|---|
| Backend | Node.js 20, Express 4 |
| Frontend | Vanilla HTML/CSS/JS (ES-модули) |
| БД | PostgreSQL 16, `schema-per-service`, `node-pg-migrate` |
| Edge | nginx 1.24 (alpine) + supervisord в одном контейнере |
| LLM | Ollama `llama3.1:8b` через WebSocket-туннель (YandexGPT / GigaChat — целевые) |
| Auth | bcrypt cost=12 + JWT (access `15m`, refresh `30d`), совместимо с Keycloak |
| Валидация | zod |
| Контейнеризация | Docker + Docker Compose |
| Деплой | PowerShell-скрипты (`deploy.ps1`, `deploy_up.ps1`) на VPS |

---

## Карта документации

Вся документация — в папке [`_docs/`](./_docs/).

### Продуктовые

| Документ | О чём |
|---|---|
| [vision.md](./_docs/vision.md) | Проблема, аудитория, ценность, отличие от job-бордов |
| [roadmap.md](./_docs/roadmap.md) | Что делаем на MVP, что в Post-MVP |
| [open-questions.md](./_docs/open-questions.md) | Нерешённые вопросы и решения по ним |
| [screens.md](./_docs/screens.md) | Экраны по ролям и их привязка к ТЗ |
| [user-flows.md](./_docs/user-flows.md) | Сценарии: кандидат, работодатель, сквозной демо |

### Архитектура

| Документ | О чём |
|---|---|
| [architecture.md](./_docs/architecture.md) | Общая архитектура и request flow |
| [microservices.md](./_docs/microservices.md) | Список сервисов и их взаимосвязь |
| [data-model.md](./_docs/data-model.md) | Схема БД, таблицы, правила видимости |
| [api.md](./_docs/api.md) | Обзор API и эндпоинты |
| [openapi.yaml](./_docs/openapi.yaml) | OpenAPI-спецификация (черновая) |
| [integrations.md](./_docs/integrations.md) | ФСП, Keycloak, ATS, SMTP, S3 |
| [migration.md](./_docs/migration.md) | Монолит → микросервисы, пошагово |

### Качество и эксплуатация

| Документ | О чём |
|---|---|
| [security.md](./_docs/security.md) | Безопасность и 152-ФЗ |
| [observability.md](./_docs/observability.md) | Логи, метрики, трейсинг, алерты |
| [slo.md](./_docs/slo.md) | SLO и capacity planning |
| [testing.md](./_docs/testing.md) | Пирамида тестов, contract, нагрузочное |
| [validation.md](./_docs/validation.md) | Процедура валидации решения и результаты |
| [deployment.md](./_docs/deployment.md) | Сборка, деплой, окружения |
| [local-setup.md](./_docs/local-setup.md) | Локальный запуск для разработчика |
| [runbook.md](./_docs/runbook.md) | Типовые инциденты и решения |

### ИИ

| Документ | О чём |
|---|---|
| [ai.md](./_docs/ai.md) | Три точки входа LLM, провайдер, экономика |
| [ai-testing.md](./_docs/ai-testing.md) | Генерация тестов, оценка, сопоставимость |
| [ai-prompts.md](./_docs/ai-prompts.md) | Шаблоны промптов |

---

## Структура проекта

```
.
├─ Dockerfile                     # 2-stage: deps + nginx/supervisor/node
├─ docker-compose.yml
├─ deploy.ps1                     # полный деплой со сбросом БД
├─ deploy_up.ps1                  # деплой без сброса БД
├─ package.json
├─ nginx/
│  ├─ default.conf                # статика + проксирование /api/*
│  └─ supervisord.conf            # supervisor: nginx + node
├─ public/                        # frontend (vanilla, ES-модули)
│  ├─ index.html                  # вход
│  ├─ register.html               # регистрация
│  ├─ email_code.html             # подтверждение e-mail
│  ├─ main.html                   # главная (новости + админ-панель)
│  ├─ profile.html                # профиль кандидата
│  ├─ profile_editing.html        # редактирование профиля
│  ├─ settings.html               # настройки (приватность, ФСП ID, согласия)
│  ├─ survey.html                 # опрос: отрасль → специализация → грейд
│  ├─ testing.html                # прохождение теста
│  ├─ testing_result.html         # результат
│  ├─ offers.html                 # входящие приглашения
│  ├─ employer/                   # кабинет работодателя
│  │  ├─ profile.html             # профиль компании
│  │  ├─ needs.html               # описание потребности
│  │  ├─ matching.html            # подборка
│  │  ├─ candidates.html          # банк кандидатов
│  │  ├─ invite.html              # форма приглашения
│  │  └─ invitations.html         # мои приглашения
│  ├─ styles.css                  # общие переменные + базовая тема
│  ├─ auth.js                     # общие утилиты авторизации
│  ├─ login.js / register.js
│  ├─ profile_script.js
│  ├─ profile_editing_script.js
│  ├─ settings_script.js
│  ├─ survey_script.js
│  ├─ testing_script.js
│  ├─ testing_result_script.js
│  ├─ offers_script.js
│  ├─ main_script.js
│  ├─ navigation_bar_script.js
│  └─ navigation_bar*.html        # три варианта навбара по ролям
├─ server/                        # backend (Express)
│  ├─ index.js                    # сборка роутов
│  ├─ db.js                       # pg-пул
│  └─ modules/
│     ├─ auth/                    # users, sessions, consents, JWT
│     ├─ profile/                 # candidates, employers, visibility
│     ├─ catalog/                 # specializations, grades, stacks
│     ├─ test/                    # questions, attempts, answers
│     ├─ matching/                # скоринг + выдача кандидатов
│     ├─ invite/                  # приглашения и статусы
│     ├─ news/                    # новости (admin: write)
│     ├─ admin/                   # управление анкетами
│     └─ ai/                      # LlmProvider, ollama, mock, health
├─ migrations/                    # node-pg-migrate, schema-per-service
├─ scripts/
│  ├─ gen-env.ps1                 # .env из .deploy-secrets.json
│  ├─ reset-db.ps1                # локальный сброс Postgres-стека
│  ├─ start-tunnel.ps1 / .sh      # клиент Ollama-туннеля
│  └─ debug-llm.js                # диагностика LLM
├─ tunnel/                        # Ollama tunnel
│  ├─ server.js                   # WS + HTTP-фасад (на VPS)
│  ├─ client.js                   # клиент (на домашнем ПК)
│  ├─ Dockerfile
│  └─ package.json
├─ _docs/                         # вся документация
└─ .env.example
```

---

## Переменные окружения

См. [`.env.example`](./.env.example). Основные:

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `NODE_ENV` | режим работы | `production` |
| `PORT` | порт Express | `3000` |
| `NODE_OPTIONS` | лимит heap | `--max-old-space-size=192` |
| `DATABASE_URL` | строка подключения к PG | — |
| `JWT_ACCESS_TTL` | срок access-токена | `15m` (можно `1h`) |
| `JWT_REFRESH_TTL` | срок refresh-токена | `30d` |
| `KEYCLOAK_ENABLED` | флаг интеграции с ФСП ID | `false` |
| `KEYCLOAK_URL` | базовый URL Keycloak | — |
| `KEYCLOAK_REALM` | realm ФСП | `fsp` |
| `KEYCLOAK_CLIENT_ID` | client_id | `fsp-web` |
| `OLLAMA_URL` | URL Ollama или фасад туннеля | `http://ollama-tunnel:11434` |
| `LLM_MODE` | `pool` / `hybrid` / `generate` | `hybrid` |
| `LLM_PROVIDER` | `auto` / `ollama` / `yandex` / `giga` / `openai` / `mock` | `auto` |
| `LLM_MODEL` | модель Ollama | `llama3.1:8b` |
| `LLM_TIMEOUT_MS` | таймаут LLM | `60000` |
| `LLM_TEMPERATURE` | температура | `0.7` |
| `TUNNEL_SECRET` | секрет туннеля VPS ↔ домашний ПК | — |
| `POSTGRES_PASSWORD` | пароль PostgreSQL | генерируется |

---

## Роли

| Роль | Возможности |
|---|---|
| **Кандидат** | Профиль, опрос, тест, категория, история попыток, приглашения, настройки |
| **Работодатель** | Профиль компании, потребность, подборка, банк, приглашения |
| **Админ** | Публикация новостей, управление анкетами (`admin@ad.min` / `1`) |

---

## Лицензия

См. [LICENSE](./LICENSE). Код открыт, без обфускации (требование ТЗ 3.5).