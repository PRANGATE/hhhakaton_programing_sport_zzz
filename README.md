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

### Деплой на VPS

```powershell
# из Windows PowerShell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

Скрипт собирает образ, сохраняет его в tar, копирует по SCP и перезапускает
контейнер на VPS. Требуется SSH-ключ без пароля к серверу.

---

## Стек

| Слой | Технология |
|---|---|
| Backend | Node.js 20, Express 4 |
| Frontend | Vanilla HTML/CSS/JS (ES-модули) |
| БД | PostgreSQL 16 *(целевая)* |
| Кеш / очередь | Redis 7 *(Post-MVP)* |
| LLM | YandexGPT / GigaChat / OpenAI / Ollama |
| Edge | nginx *(целевая)* |
| Контейнеризация | Docker, Docker Compose |
| Auth | bcrypt + JWT, Keycloak / ФСП ID (совместимо) |

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
| [openapi.yaml](./_docs/openapi.yaml) | OpenAPI-спецификация |
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
├─ Dockerfile
├─ docker-compose.yml
├─ deploy.ps1
├─ package.json
├─ nginx/                     # конфиг nginx (целевой)
├─ public/                    # frontend
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ server/                    # backend (Express)
│  └─ index.js
├─ _docs/                     # вся документация
└─ .env.example
```

---

## Переменные окружения

См. [`.env.example`](./.env.example). Основные:

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `PORT` | порт Express | `3000` |
| `NODE_OPTIONS` | лимит heap | `--max-old-space-size=192` |
| `KEYCLOAK_ENABLED` | флаг интеграции с ФСП ID | `false` |
| `KEYCLOAK_URL` | базовый URL Keycloak | — |
| `KEYCLOAK_REALM` | realm ФСП | `fsp` |
| `KEYCLOAK_CLIENT_ID` | client_id | `fsp-web` |
| `LLM_PROVIDER` | yandex / giga / openai / ollama | `yandex` |
| `LLM_DAILY_BUDGET_RUB` | дневной лимит расходов | `500` |

---

## Лицензия

См. [LICENSE](./LICENSE). Код открыт, без обфускации (требование ТЗ 3.5).