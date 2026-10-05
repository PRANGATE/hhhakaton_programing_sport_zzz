# API

Обзор. Точная спецификация — [openapi.yaml](./openapi.yaml).

Базовый путь: `/api/v1`. Формат: JSON. Аутентификация: JWT в
`Authorization: Bearer ...`.

---

## Общие принципы

- Все ответы — JSON, включая ошибки: `{ error: { code, message, details? } }`.
- Все входные данные валидируются через `zod`.
- Изменяющие запросы поддерживают `Idempotency-Key`.
- Каждый ответ содержит заголовок `X-Request-ID` для трейсинга.

## Эндпоинты (MVP)

### Health

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/health` | Liveness |
| `GET` | `/ready` | Readiness (проверка БД) |

### Конфиг

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/v1/config` | Публичные настройки фронта (в т.ч. Keycloak) |

### Auth

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Регистрация |
| `POST` | `/api/v1/auth/login` | Вход |
| `POST` | `/api/v1/auth/logout` | Выход |
| `POST` | `/api/v1/auth/verify-email` | Подтверждение e-mail |
| `POST` | `/api/v1/auth/forgot-password` | Запрос восстановления |
| `POST` | `/api/v1/auth/reset-password` | Сброс пароля |

### Profile

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/v1/profile/me` | Свой профиль |
| `PATCH` | `/api/v1/profile/me` | Обновление |
| `DELETE` | `/api/v1/profile/me` | Удаление (152-ФЗ) |
| `GET` | `/api/v1/profile/me/export` | Экспорт данных |
| `POST` | `/api/v1/profile/resume` | Загрузка PDF-резюме |

### Catalog

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/v1/catalog/specializations` | Специализации |
| `GET` | `/api/v1/catalog/grades` | Грейды |
| `GET` | `/api/v1/catalog/stacks` | Стек |

### Test

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/v1/test/start` | Старт теста на грейд |
| `GET` | `/api/v1/test/:id/questions` | Получить задания |
| `POST` | `/api/v1/test/:id/answers` | Отправить ответы |
| `GET` | `/api/v1/test/:id/result` | Результат и категория |

### Matching

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/v1/matching/query` | Свободный запрос → подборка |
| `GET` | `/api/v1/matching/runs/:id` | Сохранённая подборка |
| `GET` | `/api/v1/candidates/:id` | Карточка кандидата |

### Invites

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/v1/invitations` | Отправить приглашение |
| `GET` | `/api/v1/invitations` | Свои приглашения |
| `POST` | `/api/v1/invitations/:id/accept` | Принять |
| `POST` | `/api/v1/invitations/:id/reject` | Отклонить |

### AI (внутренние)

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/v1/ai/suggest-questions` | ИИ-помощник для чата |

## Коды ошибок

| Код | Значение |
|---|---|
| `400` | Невалидный запрос |
| `401` | Не аутентифицирован |
| `403` | Нет прав на действие |
| `404` | Не найдено |
| `409` | Конфликт (например, e-mail занят) |
| `429` | Rate-limit |
| `500` | Внутренняя ошибка |
| `503` | LLM или БД недоступны |