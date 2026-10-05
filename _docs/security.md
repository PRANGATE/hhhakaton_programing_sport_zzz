# Безопасность

## Аутентификация

- Пароли — `bcrypt` (cost ≥ 12) или `argon2id`.
- Сессии — JWT с коротким TTL (15 мин) + refresh-token в `HttpOnly` cookie.
- Обязательное подтверждение e-mail.
- Защита от перебора: rate-limit в nginx + счётчик неудачных попыток.
- Keycloak / ФСП ID — OIDC + PKCE, проверка подписи через JWKS.

## Авторизация

- Роли: `candidate`, `employer`, `moderator`, `admin`.
- Middleware `requireRole` на каждом защищённом маршруте.
- Кандидат видит только свои приглашения и отклики.
- Работодатель не видит контакты до `invitation.accepted`.

## Защита API

- CSRF: не нужен, если JWT в `Authorization`. Cookie → `SameSite=Lax` + токен.
- Идемпотентность: `Idempotency-Key` на `POST /invitations`, `/applications`.
- Rate-limit: два уровня — nginx (по IP) и приложение (по `user-id`).
- Валидация всех входных данных через `zod`.
- Только параметризованные SQL-запросы.
- XSS: на фронте только `textContent`, экранирование в шаблонах.
- CORS: явный allowlist origin + `credentials: true`.

## Security headers (nginx)

```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=()
Strict-Transport-Security: max-age=31536000   # только после валидного TLS
Content-Security-Policy: default-src 'self'
```

## Безопасность LLM

- **Prompt injection** — пользовательский ввод **никогда** не вставляется
  в системный промпт. Только в отведённые слоты, с экранированием и лимитом
  длины.
- **Анонимизация** — в LLM уходят только обезличенные признаки. Без ФИО,
  контактов, точных компаний.
- **Аудит** — каждый LLM-вызов в `ai.llm_calls`: `prompt_hash`, `model`,
  `tokens`, `latency`, `cost`.
- **Output filtering** — проверка ответа LLM на утечки промпта и вредный
  контент.
- **152-ФЗ** — приоритет российским провайдерам (YandexGPT, GigaChat)
  или локальной модели.

## 152-ФЗ

- **Согласие** — при регистрации: текст, версия, timestamp, IP.
- **Право на удаление** — `DELETE /profile/me`, soft-delete 30 дней,
  затем hard-delete.
- **Экспорт** — `GET /profile/me/export` в JSON.
- **Шифрование at-rest** — зашифрованный диск.
- **Шифрование in-transit** — TLS-only, редирект http→https.
- **Хранение в РФ.**
- **Минимизация данных** — только необходимые поля.
- **Аудит доступа** — лог «кто и когда смотрел чей профиль».

## Аудит и логи

- Все неудачные логины — с IP и user-agent.
- Раскрытие контактов (`invitation.accepted`) — в audit log.
- Изменения ролей и грейдов — с указанием автора.
- Никаких паролей, токенов, ПДн в обычных логах.