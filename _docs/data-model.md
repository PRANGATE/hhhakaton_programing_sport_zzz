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
├─ moderation
└─ ats
```

## Ключевые сущности

### auth.users

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `email` | citext UNIQUE | |
| `password_hash` | text | bcrypt cost ≥ 12 |
| `role` | enum | `candidate` / `employer` / `moderator` / `admin` |
| `email_verified_at` | timestamptz | null до подтверждения |
| `created_at` | timestamptz | |

### auth.consents

| Поле | Тип | Описание |
|---|---|---|
| `user_id` | uuid FK | |
| `version` | text | версия текста согласия |
| `accepted_at` | timestamptz | |
| `ip` | inet | |

### catalog.specializations / catalog.grades / catalog.stacks

Справочники. Версионируются полем `effective_from`.

### profile.candidate_profiles

| Поле | Тип | Описание |
|---|---|---|
| `user_id` | uuid PK | |
| `full_name` | text | скрыто до accepted |
| `phone` | text | скрыто до accepted |
| `specialization_id` | uuid FK | |
| `current_grade_id` | uuid FK | |
| `skills` | jsonb | стек, софт-скиллы |
| `visibility` | jsonb | что видно работодателю |

### test.attempts

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `spec_id` | uuid | |
| `target_grade_id` | uuid | заявленный |
| `awarded_grade_id` | uuid | фактический |
| `score` | numeric | 0–100 |
| `breakdown` | jsonb | вклад по заданиям |
| `started_at` | timestamptz | |
| `finished_at` | timestamptz | |

### test.grade_history

История смен грейда. Используется для ограничения частоты смены
(по `changed_at`).

### matching.match_runs

Сохранённые подборки. Работодатель может возвращаться к результату.

### invite.invitations

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid PK | |
| `employer_id` | uuid FK | |
| `candidate_id` | uuid FK | |
| `vacancy_id` | uuid FK NULL | необязательная привязка |
| `offer` | text | описание предложения |
| `salary_from` | integer | руб. |
| `salary_to` | integer | руб. |
| `status` | enum | `sent` / `viewed` / `accepted` / `rejected` / `expired` |
| `created_at` | timestamptz | |

### ai.llm_calls

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
   `invitation.status = 'accepted'` или `application.status != 'rejected'`.
2. **Скрытые поля** из `visibility` не отдаются в API-ответах.
3. **История ФСП** отсутствует — отдаём нейтральный пустой блок
   (обязательное требование ТЗ).
4. **Достижения ФСП** отдаются в агрегированном виде («участник 3 олимпиад»),
   без точных личных данных.

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