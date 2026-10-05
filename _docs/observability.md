# Наблюдаемость

## Логи

- Формат: JSON через `pino`.
- Уровни: `debug`, `info`, `warn`, `error`, `fatal`.
- Поля: `ts`, `level`, `msg`, `reqId`, `userId`, `route`, `latencyMs`,
  `status`, `err.stack`.
- **Correlation ID:** nginx прокидывает `X-Request-ID` (`$request_id`),
  Node читает и добавляет во все записи. Один ID — вся цепочка от nginx
  до БД и до LLM.
- Агрегация (Post-MVP): Loki / ELK / Yandex Cloud Logging.
- **Никаких паролей, токенов, ПДн в логах.**

## Метрики

- **HTTP:** RPS, p50/p95/p99 latency, 2xx/4xx/5xx rate — по маршрутам.
- **Приложение:** активные сессии, длина очередей, ошибки по домену.
- **БД:** соединения, длинные запросы (>100ms), deadlocks.
- **Ресурсы:** CPU, RSS, event loop lag.
- **Бизнес:** регистрации, тесты, приглашения в час.
- **AI:** количество LLM-вызовов, `p95 latency`, `cost per user`,
  `cache hit rate`, доля fallback.

Формат: Prometheus. Экспорт через `prom-client` на `/metrics`, закрыт для
внешнего мира.

## Трейсинг *(Post-MVP)*

- OpenTelemetry SDK в Node.
- Сквозной trace: браузер → nginx → Node → БД → LLM.
- Визуализация в Jaeger / Tempo.

## Health-check

| Эндпоинт | Что проверяет | Для чего |
|---|---|---|
| `GET /health` | процесс жив | liveness |
| `GET /ready` | `SELECT 1` в PostgreSQL | readiness |
| `GET /api/ai/health` | LLM доступен | алерт |

## Алерты *(Post-MVP)*

- Error rate > 1% за 5 минут.
- p95 latency > 1s за 5 минут.
- PostgreSQL connections > 80% от `max_connections`.
- Диск > 80%.
- `/ready` не отвечает > 30 секунд.
- LLM cost > дневного бюджета.
- Cache hit rate < 30%.

Канал: Telegram-бот / e-mail.