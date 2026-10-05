# Архитектура (общая)

Высокоуровневое описание решения. Детали по сервисам — в
[microservices.md](./microservices.md).

---

## Принцип

**Модульный монолит** на Node.js/Express в одном контейнере, спроектированный
для развёртывания в микросервисы без переписывания бизнес-логики.

## Слои

```
┌──────────────────────────────────────────────────┐
│              Браузер (SPA)                       │
│         HTML + CSS + ES-модули                   │
└───────────────────┬──────────────────────────────┘
                    │ HTTP
                    ▼
┌──────────────────────────────────────────────────┐
│              nginx (целевой)                     │
│  • статика из public/                            │
│  • reverse-proxy /api/*  →  Node.js              │
│  • TLS / HTTP2 / HTTP3, gzip, rate-limit         │
└───────────────────┬──────────────────────────────┘
                    │ HTTP/1.1
                    ▼
┌──────────────────────────────────────────────────┐
│         Node.js + Express                        │
│  • API Gateway (middleware: auth, валидация)     │
│  • Домены: Auth, Profile, Test, Matching,        │
│    Invite, Vacancy, Chat                         │
│  • AI Service (обёртка над LLM)                  │
└────┬──────────────────────────────┬──────────────┘
     │ SQL                          │ HTTP
     ▼                              ▼
┌──────────────┐              ┌──────────────┐
│ PostgreSQL   │              │ LLM-провайдер│
│ schema-per-  │              │ (Yandex,     │
│ service      │              │  Giga, ...)  │
└──────────────┘              └──────────────┘
```

## Кто за что отвечает

### Nginx

- **Отдаёт** статику из `public/` напрямую с диска.
- **Проксирует** `/api/*` на Node.
- **Терминирует** TLS, HTTP/2, HTTP/3.
- Rate-limit, gzip/brotli, security headers.

### Node.js / Express

- Аутентификация, сессии, работа с PostgreSQL.
- Вся бизнес-логика: тесты, категоризация, подбор, приглашения, чат.
- Интеграция с Keycloak / ФСП ID, ФСП-реестром, e-mail.
- **Не раздаёт статику** (в целевом состоянии) — только JSON и генерация PDF.

### AI Service

- Единая точка для LLM: генерация, оценка, разбор запроса, чат-подсказки.
- Абстракция `LlmProvider` — Yandex / Giga / OpenAI / Ollama.
- Кеш промптов, квоты, fallback.

### PostgreSQL

- Один кластер, разные схемы на сервис.
- `schema-per-service` для изоляции и лёгкого выноса.

## Request flow (пример: работодатель ищет кандидатов)

```
 1. Работодатель → HTTPS → nginx
 2. nginx: TLS handshake, отдал index.html из public/
 3. Браузер загрузил styles.css и app.js
 4. JS fetch('/api/matching/search', {...})
 5. nginx: location /api/ → proxy_pass app:3000
 6. Express: middleware auth → проверка JWT
 7. Express: validate (zod)
 8. Matching Service → AI Service → LLM: разбор запроса
 9. AI Service вернул структурированный фильтр
10. Matching Service → PostgreSQL: выборка кандидатов
11. Matching Service → AI Service → LLM: ранжирование с объяснением
12. Express → JSON → nginx → браузер
13. JS отрендерил список с обоснованием
```

## Путь эволюции

См. [migration.md](./migration.md) — как постепенно вынести модули
в микросервисы через Strangler Fig.