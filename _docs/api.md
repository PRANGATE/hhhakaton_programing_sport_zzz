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
| `POST` | `/api/v1/auth/forgot-password` | Запрос восстановления *(Post-MVP)* |
| `POST` | `/api/v1/auth/reset-password` | Сброс пароля *(Post-MVP)* |

### Profile

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/v1/profile/me` | Свой профиль (кандидат или компания) |
| `PATCH` | `/api/v1/profile/me` | Обновление |
| `DELETE` | `/api/v1/profile/me` | Удаление (152-ФЗ) *(Post-MVP)* |
| `GET` | `/api/v1/profile/me/export` | Экспорт данных *(Post-MVP)* |
| `GET` | `/api/v1/profile/industries` | Справочник отраслей |
| `GET` | `/api/v1/profile/consents` | Что уже принято (152-ФЗ) |
| `POST` | `/api/v1/profile/consents` | Принять согласие (`kind: processing\|publish`) |
| `POST` | `/api/v1/profile/resume` | Загрузка PDF-резюме *(Post-MVP)* |

#### `PATCH /profile/me` — кандидат

Пустая строка приравнивается к `undefined` (поле не трогаем). Явная
очистка — только через `null` (например, `fsp_id: null` — отвязать ФСП).

Поля: `full_name`, `telegram`, `phone`, `about`, `experience_years`,
`industry_id`, `specialization_id`, `target_grade_id`, `fsp_id`,
`roles`, `stacks`, `soft_skills`, `visibility`.

#### `POST /profile/consents`

```json
{ "kind": "publish", "version": "v1" }
```

Возвращает актуальный список согласий (последнее по каждому `kind`).

### Catalog

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/v1/catalog/specializations` | Специализации |
| `GET` | `/api/v1/catalog/grades` | Грейды |
| `GET` | `/api/v1/catalog/stacks` | Стек |

### Test

| Метод | Путь | Назначение |
|---|---|---|
| `GET`  | `/api/v1/test/history` | История попыток + текущая категория + lock'и по грейду |
| `POST` | `/api/v1/test/start` | Старт теста на грейд |
| `POST` | `/api/v1/test/:id/answers` | Отправить ответ |
| `POST` | `/api/v1/test/:id/finish` | Завершить, получить результат |

При `LLM_MODE=hybrid` и недоступном LLM — задания берутся из пула.
При `LLM_MODE=generate` — `503 llm_unavailable`.

`GET /test/history` возвращает:

```json
{
  "items": [
    {
      "id": "uuid",
      "specialization_id": "backend",
      "target_grade_id": "middle",
      "awarded_grade_id": "middle",
      "score": 78,
      "status": "passed",
      "started_at": "2026-10-09T12:34:56Z",
      "finished_at": "2026-10-09T12:56:23Z"
    }
  ],
  "current": {
    "specialization_id": "backend",
    "grade_id": "middle",
    "since": "2026-10-09T12:56:23Z"
  },
  "locks": {
    "backend|senior": {
      "until": "2027-01-07T12:34:56Z",
      "last_attempt_at": "2026-10-09T12:34:56Z"
    }
  },
  "cooldown_days": 90
}
```

Поля:

- `items` — список попыток, свежие вверху (limit 50).
- `current` — текущая подтверждённая категория (последняя успешная
  попытка). `null`, если успешных нет.
- `locks` — словарь по ключу `"<spec>|<target_grade>"`. Если попытка
  на этот грейд была не позже 90 дней назад — там лежит `until` (дата,
  до которой блокировано) и `last_attempt_at`.
- `cooldown_days` — размер окна кулдауна.

`POST /test/start` при попытке стартовать в пределах кулдауна
возвращает:

```
HTTP 429
{ "error": "grade_change_locked", "message": "Смена грейда доступна раз в 3 месяца" }
```

### Matching

| Метод | Путь | Назначение | Доступ |
|---|---|---|---|
| `POST` | `/api/v1/matching/query` | Подборка под потребность | `employer` |
| `GET` | `/api/v1/matching/candidates/:id` | Карточка кандидата | `employer` |

`POST /matching/query` — тело:

```json
{
  "specialization": "backend",
  "grade": "middle",
  "stack": ["Go", "PostgreSQL"],
  "only_fsp": false
}
```

Возвращает:

```json
{
  "items": [
    {
      "id": "uuid",
      "anon_id": "K-7A3F12",
      "specialization": "backend",
      "grade": "middle",
      "test_score": 87,
      "stacks": ["Go", "PostgreSQL"],
      "has_fsp": false,
      "score": 82,
      "explanation": "стек 2/2 · тест 87% · ФСП не привязан"
    }
  ],
  "need": { "...": "эхо запроса" }
}
```

`GET /matching/candidates/:id` возвращает карточку **без контактов**:
`id`, `anon_id`, `specialization`, `grade`, `test_score`, `test_date`,
`stacks`, `experience_years`, `soft_skills`, `about`, `fsp`.

### Invitations

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/v1/invitations` | Отправить приглашение (`employer`) |
| `GET` | `/api/v1/invitations` | Свои приглашения (по роли) |
| `GET` | `/api/v1/invitations/:id` | Деталь приглашения |
| `PATCH` | `/api/v1/invitations/:id/status` | Смена статуса |

Поля приглашения: `candidate_id`, `vacancy_title` (опционально),
`offer`, `salary_from`, `salary_to`, `channel`
(`telegram` | `email` | `phone`).

Статусы: `sent` → `viewed` → `accepted` | `rejected`.

Кандидат может ставить только `accepted` / `rejected`. Работодатель —
только `viewed`.

**Правило видимости:** поле `candidate_email` в ответе присутствует
**только** при `status = 'accepted'`. В остальных случаях — `null`.
Это гарантия 152-ФЗ и п.2.2 ТЗ.

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
| `GET` | `/api/v1/ai/status` | Расширенный статус: провайдер, режим, досягаемость Ollama, наличие модели |
| `POST` | `/api/v1/ai/suggest-questions` | ИИ-помощник для чата *(Post-MVP)* |

`GET /ai/status` дополнительно возвращает:

```json
{
  "ok": true,
  "provider": "ollama",
  "mode": "hybrid",
  "ollamaUrl": "http://ollama-tunnel:11434",
  "model": "llama3.1:8b",
  "details": {
    "reachable": true,
    "httpStatus": 200,
    "elapsedMs": 23,
    "modelRequested": "llama3.1:8b",
    "modelAvailable": true,
    "modelsCount": 3
  }
}
```

## Коды ошибок

| Код | Значение |
|---|---|
| `400` | Невалидный запрос / `validation_error` |
| `401` | Не аутентифицирован / `invalid_credentials` / `invalid_refresh` |
| `403` | Нет прав (например, не-админ дёргает `/admin/*`) |
| `404` | Не найдено / `user_not_found` |
| `409` | Конфликт (`email_taken`, `attempt_closed`, `already_closed`) |
| `429` | Rate-limit (`grade_change_locked`) |
| `500` | Внутренняя ошибка |
| `503` | LLM или БД недоступны (`llm_unavailable`, `not_enough_questions`) |

## Заголовки

| Заголовок | Откуда | Зачем |
|---|---|---|
| `Authorization: Bearer <JWT>` | клиент | аутентификация |
| `X-Real-IP` | nginx | реальный IP клиента |
| `X-Forwarded-For` | nginx | цепочка прокси |
| `X-Request-ID` | nginx | correlation-id для логов |