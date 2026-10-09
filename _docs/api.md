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
| `POST` | `/api/v1/auth/refresh` | Обновление access-токена |
| `POST` | `/api/v1/auth/verify-email` | Подтверждение e-mail |
| `GET`  | `/api/v1/auth/me` | Текущий пользователь по токену |
| `POST` | `/api/v1/auth/forgot-password` | Запрос восстановления |
| `POST` | `/api/v1/auth/reset-password` | Сброс пароля |

### Profile

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/v1/profile/me` | Свой профиль (кандидат или компания) |
| `PATCH` | `/api/v1/profile/me` | Обновление |
| `DELETE` | `/api/v1/profile/me` | Удаление (152-ФЗ) |
| `GET` | `/api/v1/profile/me/export` | Экспорт данных |
| `GET` | `/api/v1/profile/industries` | Справочник отраслей |
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
| `POST` | `/api/v1/test/:id/answers` | Отправить ответ |
| `POST` | `/api/v1/test/:id/finish` | Завершить, получить результат |

При `LLM_MODE=hybrid` и недоступном LLM — задания берутся из пула.
При `LLM_MODE=generate` — `503 llm_unavailable`.

### Matching

| Метод | Путь | Назначение | Доступ |
|---|---|---|---|
| `POST` | `/api/v1/matching/query` | Свободный запрос → подборка | `employer` |
| `GET` | `/api/v1/matching/candidates/:id` | Карточка кандидата | `employer` |

### Invites

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/v1/invitations` | Отправить приглашение |
| `GET` | `/api/v1/invitations` | Свои приглашения (по роли) |
| `GET` | `/api/v1/invitations/:id` | Деталь приглашения |
| `PATCH` | `/api/v1/invitations/:id/status` | Смена статуса |

### News

Публичное чтение, запись — только для админа.

| Метод | Путь | Назначение | Доступ |
|---|---|---|---|
| `GET` | `/api/v1/news` | Лента новостей | все |
| `POST` | `/api/v1/news` | Опубликовать новость | `admin` |
| `DELETE` | `/api/v1/news/:id` | Удалить новость | `admin` |

### Admin

Управление анкетами соискателей и работодателей. Все эндпоинты —
`requireRole('admin')`.

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/v1/admin/candidates` | Список соискателей |
| `DELETE` | `/api/v1/admin/candidates/:userId` | Удалить анкету соискателя |
| `GET` | `/api/v1/admin/employers` | Список работодателей |
| `DELETE` | `/api/v1/admin/employers/:userId` | Удалить анкету работодателя |

Удаление каскадное: FK `ON DELETE CASCADE` подчищает профиль, сессии,
приглашения, попытки теста.

### AI

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/v1/ai/health` | Доступность LLM-провайдера (не блокирует) |
| `POST` | `/api/v1/ai/suggest-questions` | ИИ-помощник для чата *(Post-MVP)* |

## Коды ошибок

| Код | Значение |
|---|---|
| `400` | Невалидный запрос |
| `401` | Не аутентифицирован |
| `403` | Нет прав (например, не-админ дёргает `/admin/*`) |
| `404` | Не найдено |
| `409` | Конфликт (например, e-mail занят, попытка закрыта) |
| `429` | Rate-limit (например, смена грейда раз в 3 месяца) |
| `500` | Внутренняя ошибка |
| `503` | LLM или БД недоступны |