# Модель данных

Схема БД. PostgreSQL. Каждый сервис владеет своей схемой.
Прямой доступ к чужой схеме запрещён.

---

## Схемы

```
database: fsp
├─ auth
├─ profile
├─ catalog
├─ test
├─ matching
├─ invite
├─ vacancy
├─ fsp
├─ notification
├─ ai
├─ chat
├─ news
├─ moderation
└─ ats
```

Реально используются: `auth`, `profile`, `catalog`, `test`, `invite`,
`news`. Остальные созданы миграцией `0001_init_schemas.js` для будущих
сервисов.

## Ключевые сущности

### auth.users

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `email` | citext UNIQUE | |
| `password_hash` | text | bcrypt cost ≥ 12 |
| `role` | enum | `candidate` / `employer` / `admin` / `moderator` |
| `email_verified_at` | timestamptz | null до подтверждения |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Админ `admin@ad.min` заводится миграцией `1704067210000_admin_seed.js`
с `email_verified_at = now()` и паролем `1`.

### auth.consents

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `kind` | text | `processing` (при регистрации) / `publish` (по кнопке в настройках) |
| `version` | text | версия текста согласия (`v1`) |
| `accepted_at` | timestamptz | |
| `ip` | inet | |

Индекс: `(user_id)`, `(user_id, kind)`.

### auth.sessions

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `refresh_hash` | text UNIQUE | sha256 от refresh-токена |
| `user_agent` | text | |
| `ip` | inet | |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz | |
| `revoked_at` | timestamptz | null, если активна |

### catalog.specializations / catalog.grades / catalog.stacks

Справочники. Версионируются полем `effective_from`.

- `catalog.specializations` — `backend`, `frontend`, `mobile`,
  `data-analytics`, `devops`, `qa`, `infosec`, `gamedev`.
- `catalog.grades` — `junior` (level 1), `middle` (2), `senior` (3).
- `catalog.stacks` — языки, фреймворки, БД, инфра, ML (с категориями).

### profile.candidates

| Поле | Тип | Описание |
|---|---|---|
| `user_id` | uuid PK FK | |
| `full_name` | text | скрыто до `accepted` |
| `telegram` | text | скрыто до `accepted` |
| `phone` | text | скрыто до `accepted` |
| `about` | text | |
| `experience_years` | numeric(4,1) | |
| `industry_id` | text | |
| `specialization_id` | text FK | |
| `target_grade_id` | text FK | |
| `current_grade_id` | text FK | |
| `fsp_id` | text | ID участника ФСП. NULL = не привязан. Валидация формата — Post-MVP |
| `roles` | jsonb | массив `{id, name}` |
| `stacks` | jsonb | массив `{id, name}` |
| `soft_skills` | jsonb | массив строк |
| `visibility` | jsonb | `{stacks, experience, soft_skills}` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Индексы: `(specialization_id)`, `(current_grade_id)`.

Дефолт `visibility`:
```json
{"stacks": true, "experience": true, "soft_skills": false}
```

### profile.employers

| Поле | Тип | Описание |
|---|---|---|
| `user_id` | uuid PK FK | |
| `company_name` | text NOT NULL | |
| `industry_id` | text | |
| `contact_person` | text | |
| `contact_email` | text | |
| `contact_telegram` | text | |
| `contact_phone` | text | |
| `default_channel` | text | `telegram` / `email` / `phone` |
| `description` | text | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### profile.grade_history

История смен грейда. **В текущей реализации не используется** —
лимит 90 дней считается по `test.attempts.started_at`. Таблица оставлена
на будущее (аудит).

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `grade_id` | text | |
| `changed_at` | timestamptz | |

### test.questions

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `specialization_id` | text | |
| `grade_id` | text | |
| `topic` | text | |
| `difficulty` | smallint | 1..5 |
| `kind` | text | `single` / `multi` / `text` |
| `prompt` | text | |
| `options` | jsonb | для single/multi |
| `correct` | jsonb | индекс / массив индексов |
| `rubric` | jsonb | для свободного ответа |
| `is_anchor` | boolean | якорное задание |
| `active` | boolean | |
| `generated_by_llm` | boolean | |
| `model` | text | какой моделью сгенерировано |
| `prompt_hash` | text | |
| `created_at` | timestamptz | |

### test.attempts

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `specialization_id` | text | |
| `target_grade_id` | text | заявленный |
| `awarded_grade_id` | text | фактический (null если fail) |
| `score` | smallint | 0–100 |
| `status` | text | `in_progress` / `passed` / `failed` / `expired` |
| `question_ids` | jsonb | какие задания выдавались |
| `started_at` | timestamptz | |
| `finished_at` | timestamptz | |

Индекс: `(user_id, started_at DESC)`.

**Кулдаун 90 дней** считается по `started_at` для пары
`(user_id, specialization_id, target_grade_id)` в пределах текущего
окна.

### test.answers

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `attempt_id` | uuid FK | |
| `question_id` | uuid FK | |
| `payload` | jsonb | `{choice}` / `{choices}` / `{text}` |
| `is_correct` | boolean | |
| `score` | smallint | 0–100 |
| `answered_at` | timestamptz | |

### invite.invitations

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `employer_id` | uuid FK | |
| `candidate_id` | uuid FK | |
| `vacancy_title` | text | опционально |
| `offer` | text | описание предложения |
| `salary_from` | integer | руб. |
| `salary_to` | integer | руб. |
| `channel` | text | `telegram` / `email` / `phone` |
| `status` | text | `sent` / `viewed` / `accepted` / `rejected` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

CHECK: `salary_from >= 0`, `salary_to >= salary_from`.

Индексы: `(employer_id, created_at DESC)`,
`(candidate_id, created_at DESC)`.

### news.posts

Публичные новости платформы, публикуются администратором.
Читают все, пишет только `role = 'admin'`.

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `title` | text NOT NULL | до 200 символов |
| `body` | text NOT NULL | до 10 000 символов |
| `author_id` | uuid FK → auth.users | NULL, если автор удалён |
| `published_at` | timestamptz NOT NULL | по умолчанию `now()` |
| `created_at` | timestamptz NOT NULL | |

### ai.llm_calls (Post-MVP)

Заготовка на будущее. Реально не используется.

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `prompt_hash` | text | для кеша и группировки |
| `model` | text | какая модель |
| `tokens_in` / `tokens_out` | integer | |
| `latency_ms` | integer | |
| `cost_rub` | numeric | |
| `created_at` | timestamptz | |

## Правила видимости

1. **Контактные данные** (`email`, `phone`) скрыты для работодателя до
   `invitation.status = 'accepted'`. Реализовано на уровне SQL:
   ```sql
   CASE WHEN i.status = 'accepted' THEN cu.email ELSE NULL END AS candidate_email
   ```
2. **Скрытые поля** из `visibility` не отдаются в API-ответах.
3. **История ФСП** отсутствует — отдаём нейтральный пустой блок
   (обязательное требование ТЗ).
4. **Достижения ФСП** отдаются в агрегированном виде («участник 3
   олимпиад»), без точных личных данных.
5. **ФСП ID** кандидата — это его собственный идентификатор, не скрываем
   от самого кандидата, но и не показываем работодателю до `accepted`.
6. **Роль `admin`** — служебная. Единственный аккаунт, заводится
   миграцией. Удаление пользователей каскадное: FK `ON DELETE CASCADE`
   в `profile`, `auth.sessions`, `invite.invitations`, `test.attempts`.

## Партиционирование (Post-MVP)

Растущие таблицы — по месяцу:

- `test.attempts` — по `started_at`
- `ai.llm_calls` — по `created_at`
- `analytics.events` — по `occurred_at`

## Миграции

`node-pg-migrate`. Запускаются отдельным job'ом **перед** деплоем app.

Правила безопасных изменений:

1. `ADD COLUMN` — только `NULLABLE` или с дефолтом.
2. Backfill отдельной миграцией.
3. `SET NOT NULL` — после backfill, отдельным релизом.
4. `DROP COLUMN` — через релиз после того, как код перестал её читать.

### Список миграций

| Файл | Что делает |
|---|---|
| `0001_init_schemas.js` | Создаёт 14 схем |
| `0002_auth_users.js` | Таблица `auth.users` + citext |
| `1704067200000_catalog.js` | Справочники `catalog.*` |
| `1704067201000_catalog_seed.js` | Сиды: 8 специализаций, 3 грейда, 30 стеков |
| `1704067202000_auth_consents_sessions.js` | `auth.consents`, `auth.sessions` |
| `1704067203000_profile.js` | `profile.candidates`, `profile.employers`, `profile.grade_history` |
| `1704067204000_test.js` | `test.questions`, `test.attempts`, `test.answers` |
| `1704067205000_test_seed.js` | 10 эталонных тестовых заданий |
| `1704067206000_invitations.js` | `invite.invitations` |
| `1704067207000_profile_roles.js` | Колонка `roles` в `profile.candidates` |
| `1704067208000_questions_llm.js` | Поля `generated_by_llm`, `model`, `prompt_hash` |
| `1704067209000_news.js` | Схема `news` + `news.posts` |
| `1704067210000_admin_seed.js` | Пользователь `admin@ad.min` |
| `1704067211000_candidate_fsp_id.js` | Колонка `fsp_id` в `profile.candidates` |