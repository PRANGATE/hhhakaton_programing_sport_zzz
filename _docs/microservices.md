# Микросервисная архитектура

Целевая архитектура решения. На хакатоне реализуется **модульный монолит**
(один app-контейнер Node.js), но спроектирован он так, чтобы после хакатона
без переписывания кода развернуться в **микросервисную систему** с nginx,
PostgreSQL и выделенным AI-слоем.

---

## 1. Принципы

1. **Разделение по доменам** (DDD bounded context), не по техническим слоям.
2. **У каждого сервиса — своя схема в БД** (на старте общий кластер PostgreSQL).
3. **Общение — через REST и события.** Прямой доступ к чужой схеме запрещён.
4. **Аутентификация централизована** — Keycloak / ФСП ID.
5. **Nginx — единая точка входа**: статика, reverse-proxy для API.
6. **Сервисы stateless** — состояние в БД, S3, Redis. Готовность к K8s.
7. **Безопасность по умолчанию** — HTTPS-only, минимальные права,
   все секреты вне кода.
8. **LLM — за абстракцией.** Ни один доменный сервис не вызывает LLM напрямую:
   только через AI Service с единым интерфейсом, кешем, квотами и fallback.

---

## 2. Кто за что отвечает

### 2.1. Nginx — edge-слой

**Отдаёт напрямую, без участия Node:**

- всю статику из `public/` (HTML, CSS, JS, картинки, шрифты);
- файлы `robots.txt`, `sitemap.xml`, `favicon.ico`;
- сгенерированные PDF-профили (если публичные).

**Делает как reverse-proxy:**

- принимает все `/api/*` и проксирует на Node.js;
- терминирует TLS;
- HTTP/2 и HTTP/3 на клиенте (внутри — HTTP/1.1 на Node);
- gzip / brotli;
- rate-limit на `/api/auth/*`;
- security headers;
- логи доступа.

### 2.2. Node.js / Express — прикладной слой

**Отвечает за всё, что не умеет nginx:**

- аутентификация, сессии, JWT;
- работа с PostgreSQL (CRUD, транзакции);
- бизнес-логика (тесты, категоризация, подбор, приглашения);
- интеграция с Keycloak / ФСП ID;
- интеграция с внешними API (ФСП, ATS, e-mail);
- раздача динамического контента (JSON, PDF-генерация);
- фоновые задачи (уведомления, рассылки);
- **вызовы LLM — только через AI Service**, никогда напрямую.

**Не участвует в раздаче статики.** Это ключевое разделение.

### 2.3. AI-слой

**Что делает:**

- генерирует уникальные тестовые задания под кандидата;
- оценивает свободные ответы по рубрике;
- считает итоговый балл и определяет категорию;
- разбирает свободный запрос работодателя → структурированный фильтр;
- ранжирует кандидатов с объяснением;
- подсказывает работодателю вопросы для чата с кандидатом.

**Как устроен:**

- единый сервис **AI Service**, за интерфейсом `LlmProvider`;
- провайдер переключается флагом (YandexGPT / GigaChat / OpenAI / локальный);
- кеш промптов в Redis, очереди на тяжёлые задачи, квоты на пользователя;
- fallback на пул задач и формульный скоринг, если LLM недоступен;
- **ПДн в LLM не уходят** — только обезличенные признаки.

---

## 3. Схема (целевая)

```
                        ┌──────────────────────┐
                        │   Клиенты (web)      │
                        └───────────┬──────────┘
                                    │ HTTPS
                                    ▼
                     ┌─────────────────────────────┐
                     │           NGINX             │
                     │  • статика (public/)        │
                     │  • TLS / HTTP2 / HTTP3      │
                     │  • gzip / brotli / кеш      │
                     │  • reverse-proxy /api/*     │
                     └──────────────┬──────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
              статика│                             │/api/*
                     ▼                             ▼
             ┌───────────────┐          ┌──────────────────┐
             │  /var/www/    │          │   Node.js /      │
             │  public/      │          │   Express        │
             └───────────────┘          │   (API Gateway   │
                                        │    + домены)     │
                                        └────────┬─────────┘
                                                 │
                        ┌────────────────────────┼──────────────────────┐
                        │                        │                      │
                        ▼                        ▼                      ▼
                ┌──────────────┐        ┌──────────────────┐   ┌───────────────┐
                │  PostgreSQL  │        │   AI Service     │   │    Redis      │
                │  schema-per- │◀───────│  • LlmProvider   │◀─▶│  кеш промптов │
                │  service     │        │  • квоты         │   │  очереди      │
                └──────────────┘        │  • fallback      │   └───────────────┘
                                        └────────┬─────────┘
                                                 │
                                                 ▼
                                        ┌──────────────────┐
                                        │  LLM-провайдер   │
                                        │ (Yandex/Giga/... │
                                        │  или локальный)  │
                                        └──────────────────┘

              (Post-MVP, по мере роста)
                                        ┌──────────────────┐
                                        │   Message Bus    │
                                        │  (RabbitMQ/      │
                                        │   Kafka)         │
                                        └────────┬─────────┘
                                                 │ события
              ┌──────────────┬───────────────────┼───────────────┬──────────────┐
              ▼              ▼                   ▼               ▼              ▼
       ┌────────────┐ ┌────────────┐   ┌───────────┐  ┌───────────┐  ┌────────────┐
       │Notification│ │ Analytics  │   │   FSP     │  │    ATS    │  │    Chat    │
       └────────────┘ └────────────┘   └───────────┘  └───────────┘  └────────────┘
```

---

## 4. Nginx — конфигурация

**Задачи:**

- статика — с диска, `try_files`, ETag, длинный кеш для ассетов;
- API — `proxy_pass` на `app:3000`;
- WebSocket — `Upgrade`/`Connection` для чата;
- TLS — Let's Encrypt или самоподписанный сертификат;
- rate-limit на авторизацию;
- security headers;
- gzip / brotli;
- корректное определение IP клиента за прокси.

**Фрагмент `nginx/default.conf`:**

```nginx
upstream api {
    server app:3000;
    keepalive 32;
}

limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name _;

    root /var/www/public;
    index index.html;

    client_max_body_size 20m;
    client_body_timeout 30s;
    client_header_timeout 15s;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_types
        text/plain text/css text/xml
        application/json application/javascript application/xml
        image/svg+xml;

    add_header X-Content-Type-Options   "nosniff"                          always;
    add_header X-Frame-Options          "SAMEORIGIN"                       always;
    add_header Referrer-Policy          "strict-origin-when-cross-origin"  always;
    add_header Permissions-Policy       "geolocation=(), microphone=()"    always;
    # HSTS — только после включения валидного TLS.

    location / {
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    location ~* \.(css|js|png|jpg|jpeg|svg|gif|ico|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID      $request_id;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;

        proxy_read_timeout    60s;   # LLM может думать долго
        proxy_connect_timeout 5s;
        proxy_send_timeout    30s;
    }

    location /api/auth/ {
        limit_req zone=auth_limit burst=10 nodelay;
        limit_req_status 429;

        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID      $request_id;
    }

    location = /health {
        proxy_pass http://api;
        access_log off;
    }

    location ~ /\.(?!well-known) {
        deny all;
    }
}
```

**Что это даёт:**

| Задача | Кто решает | Эффект |
|---|---|---|
| Раздача статики | nginx | ~10× быстрее Node, ~5 MB RAM |
| TLS / HTTP2 | nginx | Node не тратит CPU на шифрование |
| Сжатие | nginx | Экономия трафика в 3–5 раз на JSON |
| Кеш ассетов | nginx | Браузер не ходит на сервер |
| Rate-limit | nginx | Node не тратит ресурсы на отсев ботов |
| Security headers | nginx | Централизованно, не в коде |
| Прокидка request-id | nginx | Единый ID для логов и трейсинга |
| Бизнес-логика | Node | То, что nginx не умеет |

---

## 5. Список сервисов

### 5.1. Edge / Gateway (nginx)

**Задача:** единая точка входа.

- раздача статики;
- reverse-proxy `/api/*` на Node;
- TLS-терминация, HTTP/2, HTTP/3;
- rate-limit, security headers, логи, gzip.

**Стек:** nginx (alpine).

---

### 5.2. API Gateway (в составе Node-приложения)

**Задача:** маршрутизация внутри Node, единая точка для middleware.

**Функции:**
- CORS, body-parser, request-id;
- валидация запроса (zod);
- проверка JWT / сессии;
- авторизация по ролям (`requireRole`);
- единый формат ошибок.

Реализуется как слой middleware в Express, не отдельный процесс.

---

### 5.3. Auth Service

**Задача:** аутентификация, регистрация, сессии, роли.

**Функции:**
- регистрация кандидатов и работодателей;
- подтверждение e-mail;
- вход по паролю и через Keycloak / ФСП ID;
- выдача / отзыв JWT;
- роли (`candidate`, `employer`, `moderator`, `admin`);
- согласия по 152-ФЗ.

**Схема БД:** `auth`: `users`, `sessions`, `roles`, `consents`.

---

### 5.4. Profile Service

**Задача:** профили кандидатов и работодателей.

**Функции:**
- профиль кандидата: ФИО, стек, опыт, софт-скиллы;
- профиль компании;
- парсинг PDF-резюме;
- генерация стандартизированного PDF;
- правила видимости контактов;
- поиск по банку кандидатов.

**Схема БД:** `profile`. Файлы — S3.

---

### 5.5. Catalog Service

**Задача:** справочники.

**Функции:**
- отрасли, специализации, грейды, стеки;
- версионирование;
- публичный API для фронта.

**Схема БД:** `catalog`.

---

### 5.6. Test Service

**Задача:** опрос, тестирование, категоризация.

**Функции:**
- опрос по отрасли и специализации;
- **генерация уникальных заданий через AI Service** под профиль кандидата;
- приём ответов, **оценка свободных ответов LLM по рубрике**;
- **итоговый балл** — агрегация по заданиям с весами;
- валидация заданий (якорные задачи, индекс дискриминативности);
- присвоение / смена грейда;
- ограничение смены грейда по времени;
- история попыток.

**Схема БД:** `test`.

**Интеграции:** AI Service (генерация, оценка, скоринг).

---

### 5.7. Matching Service

**Задача:** подбор и ранжирование кандидатов.

**Функции:**
- **ИИ-разбор свободного запроса работодателя** через AI Service →
  структурированный фильтр `(специализация, грейд, стек, софт-скиллы)`;
- определение категорий;
- **LLM-ранжирование** топ-N кандидатов + объяснимость;
- fallback: формульный скоринг
  `score = w1*testScore + w2*fspContribution + w3*freshness + w4*completeness`;
- история подборок;
- фильтры без потери исходной подборки.

**Схема БД:** `matching`.

**Интеграции:** AI Service (разбор запроса, ранжирование, объяснения).

---

### 5.8. Invite Service

**Задача:** приглашения и отклики.

**Функции:**
- приглашение с описанием и зарплатой;
- отклик кандидата на вакансию;
- статусы (`sent`, `viewed`, `accepted`, `rejected`, `expired`);
- раскрытие контактов при `accepted`;
- лимиты на приглашения (антиспам).

**Схема БД:** `invite`.

---

### 5.9. Vacancy Service

**Задача:** публикация и ведение вакансий.

**Функции:**
- CRUD вакансий;
- обязательные поля: стек, специализация, грейд, **зарплата от–до**;
- публикация / снятие / архив;
- статистика по вакансии.

**Схема БД:** `vacancy`.

---

### 5.10. FSP Integration Service

**Задача:** интеграция с реестром ФСП.

**Функции:**
- получение достижений по ФСП ID;
- кеширование;
- нормализация данных;
- graceful degradation (нет истории — профиль работает);
- расчёт вклада достижений в общий скор.

**Схема БД:** `fsp`.

---

### 5.11. Notification Service

**Задача:** уведомления.

**Функции:**
- e-mail (регистрация, приглашения, статусы);
- in-app уведомления;
- шаблоны писем;
- очередь доставки с ретраями.

**Схема БД:** `notification`.

---

### 5.12. AI Service ⭐ *(новый)*

**Задача:** единая точка для всех вызовов LLM.

**Функции:**
- **абстракция `LlmProvider`** — переключение провайдера флагом
  (YandexGPT / GigaChat / OpenAI / Ollama локально);
- **Prompt management** — шаблоны с версиями, тесты промптов, деплой без кода;
- **Кеш промптов в Redis** — одинаковые запросы не гоняем дважды;
- **Очереди** (BullMQ / RabbitMQ) — тяжёлые генерации и оценки асинхронно;
- **Rate-limit и квоты** — на пользователя и на сервис, защита от runaway-расхода;
- **Fallback** — если провайдер упал или вернул мусор → пул задач / формула;
- **Логирование** — `prompt_hash`, `model`, `tokens_in/out`, `latency`, `cost`;
- **Анонимизация** — ПДн не уходят в LLM, только обезличенные признаки;
- **Anti-prompt-injection** — пользовательский ввод не вставляется в системный
  промпт, только в отведённые слоты с экранированием.

**Схема БД:** `ai`: `prompts`, `prompt_versions`, `llm_calls`, `cache_entries`,
`quotas`.

**Потребители:** Test Service, Matching Service, Chat Service.

---

### 5.13. Chat Service ⭐ *(новый)*

**Задача:** диалог между принявшим приглашение кандидатом и работодателем.

**Функции:**
- диалоги и сообщения (WebSocket / SSE для real-time);
- история переписки;
- **ИИ-помощник работодателя**: по запросу выдаёт 3–5 предложений вопросов
  для кандидата, сгруппированных по темам («опыт», «soft skills», «мотивация»,
  «уточнить стек»);
- флаг «ИИ-помощник использован» — прозрачность для кандидата;
- работает через AI Service, промпт кешируется по
  `(candidate_hash, vacancy_hash)`;
- **в LLM уходят только обезличенные данные**: категория, стек, ответы тестов,
  агрегированные достижения. Без ФИО и контактов.

**Схема БД:** `chat`: `conversations`, `messages`, `ai_suggestions`.

**Интеграции:** AI Service (генерация вопросов), Notification Service
(уведомления о новых сообщениях).

---

### 5.14. Analytics Service *(Post-MVP)*

**Задача:** аналитика для работодателей и продукта.

**Функции:**
- воронка приглашений;
- время до ответа;
- конверсии по категориям;
- продуктовые метрики;
- **метрики AI** — доля успешных генераций, средняя стоимость на пользователя,
  распределение оценок LLM по грейдам (для валидации).

**Хранилище:** отдельная БД PostgreSQL или ClickHouse.

---

### 5.15. Moderation / Anti-fraud *(Post-MVP)*

**Задача:** защита от фиктивных вакансий.

**Функции:**
- верификация компании (ИНН, домен);
- автоматические сигналы;
- очередь ручной модерации;
- репутация работодателя;
- блокировки.

**Схема БД:** `moderation`.

---

### 5.16. ATS Integration *(Post-MVP)*

**Задача:** интеграция с ATS работодателей.

**Функции:**
- webhook'и при событиях;
- REST-коннекторы (Huntflow, Greenhouse);
- синхронизация статусов;
- OAuth в ATS;
- маппинг полей.

**Схема БД:** `ats`.

---

## 6. ИИ в архитектуре

Три точки входа LLM, каждая закрывает свой пункт ТЗ.

### 6.1. ИИ в тестировании (Test Service)

**Что делает LLM:**

1. **Генерация задания** по шаблону:
   `(специализация, грейд, тема, сложность)` → структурированный JSON:
   текст задачи, варианты или поле для свободного ответа, рубрика оценки.
2. **Оценка ответа** по рубрике:
   `(задание, рубрика, ответ)` → `{score: 0-100, breakdown: [...], feedback}`.
3. **Итоговый балл** — агрегация по заданиям с весами.

**Как решаем проблему сопоставимости** (ТЗ прямо предупреждает: «генерация
нейросетью не гарантирует сопоставимую сложность»):

- **Якорные задачи** — пул из ~30 эталонных заданий, откалиброванных
  экспертом. Каждое новое сгенерированное задание проходит «поверку»:
  LLM-difficulty-classifier определяет уровень, и если расхождение с
  заявленным грейдом > X — задание отбрасывается.
- **Рубрики, а не «правильный ответ»** — оценка идёт по критериям
  (корректность, полнота, алгоритмическая сложность). Это даёт
  стабильность оценки между кандидатами.
- **Double-check** для спорных ответов (score 40–60%) — второй прогон
  или self-consistency (несколько прогонов, медиана).
- **Логирование для валидации** — каждый тест и оценка сохраняются,
  можно считать дискриминативность и проверять распределение по грейдам.

**Fallback:** если AI Service недоступен → задания из заранее
подготовленного пула эталонных, оценка по ключам.

### 6.2. ИИ в подборе (Matching Service)

**Что делает LLM:**

1. **Разбор свободного запроса** работодателя:
   > «Нужен бэкендер на Go, чтобы умел в микросервисы, был опыт с Kafka,
   > и чтобы не джун, но и не сеньор — что-то среднее»

   → структурированный фильтр:
   ```json
   {
     "specialization": "backend",
     "grade": "middle",
     "stack": ["Go", "Kafka", "microservices"],
     "must_have": ["Go"],
     "nice_to_have": ["Kafka", "microservices"]
   }
   ```
2. **Ранжирование** — топ-50 кандидатов (уже отобранных по фильтру)
   → LLM возвращает порядок + объяснение «почему этот выше».
3. **Генерация объяснений** для UI: «совпадение по стеку 4/5, грейд
   совпал, есть достижения ФСП, свежий профиль».

**Как обеспечиваем объяснимость** (ТЗ 2.1):

- В ответе API всегда есть `explanation` — что совпало, что нет, с весами.
- В UI разворачивается в «+40 за Go, +20 за Kafka, +15 за грейд, +10 за ФСП».

**Fallback:** если LLM недоступен → формульный скоринг
`0.50*test + 0.25*fsp + 0.15*freshness + 0.10*completeness`.

### 6.3. ИИ-помощник в чате (Chat Service)

**Что делает LLM:**

- На вход: обезличенный профиль кандидата + текст вакансии + история диалога.
- На выход: 3–5 предложений вопросов, сгруппированных по темам:
  «про опыт», «проверить soft skills», «уточнить стек», «проверить мотивацию».

**Что НЕ уходит в LLM:** ФИО, контакты, точные даты, названия компаний из
резюме. Только: категория, стек, ответы тестов, агрегированные достижения
ФСП («участник 3 олимпиад, лучшее место — 2-е»).

### 6.4. Абстракция `LlmProvider`

Все три точки работают через один интерфейс:

```js
interface LlmProvider {
  generateTest(params): Promise<TestTask>
  evaluateAnswer(params): Promise<Evaluation>
  parseQuery(params): Promise<StructuredFilter>
  rankCandidates(params): Promise<RankedList>
  suggestQuestions(params): Promise<Question[]>
}
```

Реализации:
- `YandexGptProvider` — российский, 152-ФЗ-совместим.
- `GigaChatProvider` — российский, аналогично.
- `OpenAiProvider` — fallback, только для обезличенных данных.
- `OllamaProvider` — локальный, для dev и экспериментов.

Переключение — переменной `LLM_PROVIDER=yandex|giga|openai|ollama`.
Точка расширения: любой новый провайдер добавляется одной реализацией.

### 6.5. Экономика LLM

- **Кеш** — Redis, TTL 24 ч для генерации, 1 ч для ранжирования.
- **Квоты** — на пользователя (например, 20 генераций в день) и на сервис
  (например, 5000 запросов в день).
- **Батчинг** — где можно, объединять запросы (например, оценить все
  ответы кандидата одним вызовом).
- **Метрики** — `cost_per_user`, `cost_per_test`, `cost_per_match`.
  При выходе за бюджет — алерт и автоматический переход в fallback.
- **Кеш промптов по хешу** — одинаковые входные → тот же ответ, без вызова.

---

## 7. Данные

### 7.1. PostgreSQL — с самого начала

Выбран сразу, потому что:

- транзакции и MVCC — корректная работа при конкуренции;
- **JSONB** — гибкие поля (навыки, ответы, промпты) без потери SQL-мощи;
- **полнотекстовый поиск** (`tsvector`) — фильтрация без ElasticSearch;
- **партиционирование** — для растущих таблиц (`attempts`, `llm_calls`, `events`);
- **репликация** — read-replica для аналитики;
- **миграции** — контроль версий схемы (`node-pg-migrate`).

### 7.2. Schema-per-service

Один кластер, разные схемы. Это даёт изоляцию и удобный вынос сервиса
в отдельную БД, когда он вырастет:

```
PostgreSQL cluster
└─ database: fsp
   ├─ schema: auth
   ├─ schema: profile
   ├─ schema: catalog
   ├─ schema: test
   ├─ schema: matching
   ├─ schema: invite
   ├─ schema: vacancy
   ├─ schema: fsp
   ├─ schema: notification
   ├─ schema: ai
   ├─ schema: chat
   ├─ schema: moderation
   └─ schema: ats
```

Вынос: `pg_dump -n test | psql -d test_db` — и connection string меняется
в одном месте.

### 7.3. Redis

- кеш справочников и подборок;
- **кеш промптов LLM**;
- счётчики rate-limit и квоты;
- очередь для Notification и AI Service.

### 7.4. S3-совместимое хранилище

- PDF-резюме, аватарки, сгенерированные профили;
- MinIO для dev, S3 / Yandex Object Storage в проде.

---

## 8. События (Post-MVP)

Асинхронный обмен через **RabbitMQ** (на старте) → **Kafka** (при росте).

| Событие | Источник | Потребители |
|---|---|---|
| `user.registered` | Auth | Notification, Analytics |
| `profile.updated` | Profile | Matching, Analytics |
| `test.generation.requested` | Test | AI Service |
| `test.generated` | AI Service | Test |
| `test.completed` | Test | Profile, Matching, Analytics |
| `grade.changed` | Test | Notification, Matching |
| `match.query.parsed` | AI Service | Matching |
| `match.created` | Matching | Analytics |
| `invitation.sent` | Invite | Notification, Analytics, ATS |
| `invitation.accepted` | Invite | Profile, Notification, ATS, Chat |
| `invitation.rejected` | Invite | Analytics, ATS |
| `chat.message.sent` | Chat | Notification |
| `chat.ai.suggestion.generated` | AI Service | Chat, Analytics |
| `fsp.achievement.synced` | FSP Integration | Profile, Matching |
| `vacancy.published` | Vacancy | Notification, Matching |
| `llm.call.completed` | AI Service | Analytics |

Пока событий нет — сервисы вызывают друг друга напрямую внутри монолита
(через сервисные методы). Вынос на шину — когда появится второй процесс.

---

## 9. Безопасность

### 9.1. Аутентификация пользователей

- **Пароли** — только `bcrypt` (cost ≥ 12) или `argon2id`.
- **Сессии** — JWT с коротким TTL (15 мин) + refresh-token в `HttpOnly` cookie.
- **Подтверждение e-mail** — обязательное до активации кабинета.
- **Восстановление пароля** — одноразовая ссылка с TTL 15 мин.
- **Защита от перебора** — rate-limit в nginx + счётчик неудачных попыток.
- **Keycloak / ФСП ID** — OIDC + PKCE, проверка подписи JWT через JWKS.

### 9.2. Аутентификация между сервисами *(Post-MVP)*

Пока всё в одном процессе — вызовы через сервисные методы. После выноса:

- **mTLS** между сервисами (внутри доверенной сети);
- или **service-to-service JWT** с коротким TTL (5 мин) и aud-claim;
- или **API key + IP allowlist** — для простых интеграций внутри VPC.

### 9.3. Секреты

- **Только через `.env`** или Docker secrets.
- **Никаких паролей в `docker-compose.yml`** — только `env_file: .env`.
- **Ротация:** пароль БД, JWT-секрет, SMTP-пароль, ключ LLM — раз в квартал.
- **.gitignore** должен блокировать `.env`, `*.pem`, `*.key`, `id_rsa*`.
- Post-MVP: **HashiCorp Vault** или Yandex Lockbox.

### 9.4. Защита API

- **CSRF** — JWT в `Authorization` → не нужен. Cookie → обязателен
  `SameSite=Lax` + CSRF-token.
- **Идемпотентность** — `Idempotency-Key` для `POST /api/invitations`,
  `/api/applications`.
- **Rate-limit** — два уровня: nginx (по IP) + приложение (по `user-id`).
- **Валидация** — все входные данные через `zod`.
- **SQL-инъекции** — только параметризованные запросы.
- **XSS** — на фронте только `textContent` для пользовательских данных.
- **CORS** — только свой домен, `credentials: true` + allowlist origin.

### 9.5. Безопасность LLM *(новый подраздел)*

- **Prompt injection** — пользовательский ввод **никогда** не вставляется
  в системный промпт. Только в отведённые слоты с экранированием и
  ограничением длины.
- **Анонимизация** — ПДн (ФИО, контакты, точные компании) не уходят в LLM.
  Для тестов — не нужны. Для чата — только обезличенный профиль.
- **Аудит LLM-вызовов** — каждый вызов логируется: `prompt_hash`, `model`,
  `tokens`, `latency`, `cost`. Промпты, содержащие чувствительные данные
  (если такие появятся), хранятся с маскированием.
- **Совместимость с 152-ФЗ** — предпочтительны российские провайдеры
  (YandexGPT, GigaChat) или локальная модель. При использовании зарубежных —
  только обезличенные данные.
- **Output filtering** — перед отдачей ответа LLM пользователю проверяем,
  что там нет утечек системного промпта, чужого контекста или вредного
  контента.

### 9.6. Security headers (на nginx)

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Strict-Transport-Security` — после валидного TLS.
- `Content-Security-Policy` — политика под домены (CDN, Keycloak).

### 9.7. 152-ФЗ (персональные данные)

- **Согласие** — при регистрации: текст, версия, timestamp, IP.
- **Право на удаление** — `DELETE /api/profile/me`, soft-delete на 30 дней,
  затем hard-delete.
- **Экспорт данных** — `GET /api/profile/me/export` в JSON.
- **Шифрование at-rest** — volume БД на шифрованном диске.
- **Шифрование in-transit** — TLS-only, редирект `http → https`.
- **Хранение в РФ** — VPS на территории РФ.
- **Минимизация** — собираем только необходимые поля.
- **Аудит доступа** — лог «кто и когда смотрел чей профиль».

### 9.8. Аудит и логи безопасности

- Все неудачные логины — в лог с IP и user-agent.
- Все раскрытия контактов кандидата (`invitation.accepted`) — в audit log.
- Все изменения критичных сущностей (роли, грейды) — с указанием автора.
- **Каждый LLM-вызов** — в `llm_calls` с параметрами и стоимостью.

---

## 10. Наблюдаемость

### 10.1. Логи

- **Формат:** JSON через `pino`.
- **Уровни:** `debug` (dev), `info` (prod), `warn`, `error`, `fatal`.
- **Поля:** `ts`, `level`, `msg`, `reqId`, `userId`, `route`, `latencyMs`,
  `status`, `err.stack`.
- **Correlation ID:** nginx прокидывает `X-Request-ID`, Node читает и
  добавляет во все записи. Один ID — одна цепочка от nginx до БД и до LLM.
- **Агрегация** (Post-MVP): Loki / ELK / Yandex Cloud Logging.
- **Никаких паролей, токенов, ПДн в логах.**

### 10.2. Метрики

- **HTTP** — RPS, p50/p95/p99 latency, 2xx/4xx/5xx rate.
- **Приложение** — активные сессии, длина очередей, ошибки по домену.
- **БД** — соединения, длинные запросы (>100ms), deadlocks.
- **Ресурсы** — CPU, RSS, event loop lag.
- **Бизнес** — регистрации, тесты, приглашения в час.
- **AI** — количество LLM-вызовов, `p95 latency`, `cost per user`,
  `cache hit rate`, доля fallback.

**Формат:** Prometheus. Экспорт через `prom-client` на `/metrics`
(закрыт для внешнего мира).

### 10.3. Трейсинг *(Post-MVP)*

- OpenTelemetry SDK в Node.
- Сквозной trace от запроса в браузере до запроса в БД и в LLM.
- Визуализация в Jaeger / Tempo.

### 10.4. Health-check

| Эндпоинт | Что проверяет | Использование |
|---|---|---|
| `GET /health` | «процесс жив» — 200 без обращений к БД | liveness probe |
| `GET /ready` | «готов принимать» — `SELECT 1` в PostgreSQL | readiness probe |
| `GET /api/ai/health` | «LLM-провайдер доступен» | алерт, не блокирует |

### 10.5. Алерты *(Post-MVP)*

- **Error rate** > 1% за 5 минут.
- **p95 latency** > 1s за 5 минут.
- **PostgreSQL connections** > 80% от `max_connections`.
- **Диск** > 80%.
- **`/ready` не отвечает** > 30 секунд.
- **LLM cost** > дневного бюджета.
- **Cache hit rate** LLM < 30% (значит, кеш работает плохо).

Канал: Telegram-бот / e-mail / PagerDuty.

---

## 11. Контейнеризация

### 11.1. Два варианта сборки

**A. Один контейнер (требование хакатона).**

Упаковываем nginx + Node в один образ через `supervisord` или `s6-overlay`.
PostgreSQL — внешний сервис или встроен в тот же контейнер через volume.
AI Service — часть монолита, вызывает внешний LLM по HTTP.

**B. Несколько контейнеров (прод-вариант).**

`docker-compose.yml` с сервисами `nginx`, `app`, `postgres`, `redis`,
`ai` (если вынесем).

### 11.2. `docker-compose.yml` (прод-вариант)

```yaml
services:
  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./public:/var/www/public:ro
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on: [app]
    restart: unless-stopped

  app:
    build: .
    env_file: .env
    environment:
      DATABASE_URL: postgres://fsp:${POSTGRES_PASSWORD}@postgres:5432/fsp
      REDIS_URL: redis://redis:6379
      NODE_ENV: production
      NODE_OPTIONS: "--max-old-space-size=320"
      LLM_PROVIDER: yandex
      LLM_DAILY_BUDGET_RUB: "500"
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_started }
    restart: unless-stopped
    mem_limit: 512m

  postgres:
    image: postgres:16-alpine
    env_file: .env
    environment:
      POSTGRES_USER: fsp
      POSTGRES_DB: fsp
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fsp -d fsp && psql -U fsp -d fsp -c 'SELECT 1' -q"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    mem_limit: 512m

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--maxmemory", "192mb", "--maxmemory-policy", "allkeys-lru"]
    volumes:
      - redisdata:/data
    restart: unless-stopped
    mem_limit: 256m

volumes:
  pgdata:
  redisdata:
```

**Итого ресурсов на VPS:** ~1.4 GB RAM, 2 vCPU — хватает для стабильной
работы при 100–1000 активных пользователей.

---

## 12. Технологический стек

| Слой | Технология | Зачем |
|---|---|---|
| Edge | **nginx (alpine)** | Статика, TLS, HTTP/2, proxy, rate-limit, headers |
| Runtime API | **Node.js 20 LTS** | Один язык с фронтом, async I/O |
| БД | **PostgreSQL 16** | Транзакции, JSONB, FTS, репликация |
| Кеш/очередь | **Redis 7** | Кеш промптов, очереди, rate-limit |
| Валидация | zod | Runtime + типы |
| Auth | bcrypt + JWT + Keycloak | Совместимость с ФСП ID |
| **LLM** | **YandexGPT / GigaChat / OpenAI / Ollama** | Генерация, оценка, разбор, чат |
| **Очередь задач** | **BullMQ** (на Redis) | Асинхронные LLM-вызовы |
| **Промпты** | **встроенный Prompt Manager** | Версии, тесты, кеш по хешу |
| OpenAPI | swagger-ui-express | Требование ТЗ 3.5 |
| Логи | pino | JSON, correlation-id |
| Метрики | prom-client | Формат Prometheus |
| Файлы | S3 / MinIO | Стандарт |
| Шина событий | RabbitMQ *(Post-MVP)* | Слабая связанность |
| Трейсинг | OpenTelemetry *(Post-MVP)* | Сквозной trace |

---

## 13. Риски и митигация

| Риск | Вероятность | Влияние | Что делаем |
|---|---|---|---|
| **ФСП API не открыт** | **Высокая** | **Среднее** | Заглушка + `FspAdapter`. Организаторы подтвердили: доступ откроют только Post-MVP. Подключение реального API — замена одной реализации. |
| **LLM-провайдер недоступен** | Средняя | Высокое | Fallback на пул эталонных заданий и формульный скоринг. Кеш промптов в Redis. |
| **LLM «фантазирует» в оценке** | Высокая | Среднее | Якорные задачи + рубрики + double-check для спорных ответов (self-consistency). Логирование для валидации. |
| **Утечка ПДн в LLM** | Средняя | Критическое | Анонимизация, российский провайдер или локальная модель. В LLM уходят только обезличенные признаки. |
| **Расходы на LLM выходят из-под контроля** | Средняя | Среднее | Квоты на пользователя и сервис, кеш, алерты на бюджет, автоматический переход в fallback при превышении. |
| **Prompt injection** | Средняя | Среднее | Пользовательский ввод — только в отведённые слоты, экранирование, ограничение длины, output filtering. |
| PostgreSQL не тянет нагрузку | Низкая | Высокое | PgBouncer + read replica + индексы. |
| Keycloak не успеваем подключить | Средняя | Низкое | `LocalAuthProvider` как fallback, переключение флагом. |
| Утечка ПДн (общая) | Низкая | Критическое | Шифрование at-rest, минимизация, audit log, TLS-only. |
| Внешний SMTP недоступен | Средняя | Низкое | Очередь с ретраями, fallback на второй провайдер, дублирование в in-app. |
| Единая точка отказа (nginx) | Низкая | Высокое | В проде — 2+ инстанса nginx за L4-балансировщиком. |

---

## 14. Порядок выноса сервисов из монолита

Не всё сразу — итеративно:

1. **AI Service** — фундамент для всего умного, нужен Test и Matching.
2. **FSP Integration** — внешняя система, свой rate-limit.
3. **Test Service** — использует AI Service, CPU-тяжёлый.
4. **Matching Service** — использует AI Service, ML-ранжирование.
5. **Chat Service** — использует AI Service, WebSocket-нагрузка.
6. **Notification** — фоновые задачи, очередь.
7. **Auth** — при переходе на Keycloak/ФСП ID.
8. **Analytics** — когда OLAP отделится.
9. **Moderation и ATS** — по мере готовности продукта.

**Триггеры перехода:**

- >10 000 активных пользователей;
- CPU/память сервиса >70% стабильно;
- потребность в независимых релизах;
- рост команды на домены.

---

## 15. Что осознанно НЕ выносим

- **Profile + Catalog** — тесно связаны, оставить рядом;
- **Invite + Vacancy** — общая логика статусов;
- **AI Service + Chat Service** — тесно связаны в использовании,
  на старте можно держать в одном процессе, разделить при росте;
- **всё, что не имеет собственной нагрузки или релизного цикла.**

Микросервис — не самоцель. Каждый вынос должен окупаться нагрузкой,
изоляцией или независимыми релизами.