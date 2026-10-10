# Что установить и как пользоваться скриптами

Короткая инструкция. Один раз прочитать, потом пользоваться
`scripts\menu.ps1` и не думать.

---

## Часть 1. Что поставить на компьютер

Нужны **4 обязательных** программы и **1 опциональная**. Все — под
Windows.

### 1. Docker Desktop — обязательно

Скачать: https://www.docker.com/products/docker-desktop/

Зачем: собирает контейнеры и запускает их. Без него деплой не работает.

После установки:

1. Запусти Docker Desktop из Пуска.
2. Дождись, пока иконка кита в трее станет **зелёной**.
3. Открой PowerShell, проверь:

```powershell
docker --version
```

Должно ответить: `Docker version 27.X.X, build ...`. Если «не найден» —
перезапусти PowerShell. Если не помогло — переустанови Docker Desktop,
поставив галочку «Add to PATH».

**Важно:** Docker Desktop должен быть **запущен** каждый раз, когда
ты собираешься что-то деплоить. Проверять состояние — зелёный кит в
трее.

### 2. Node.js 20 или новее — обязательно

Скачать: https://nodejs.org/ (кнопка LTS).

Зачем: локальный запуск без Docker + генератор секретов + клиент туннеля.

Проверка:

```powershell
node --version
```

Должно ответить `v20.X.X` или новее. Если `v18` — сноси и ставь 20.

### 3. Git — обязательно

Скачать: https://git-scm.com/download/win

Зачем: клонировать репозиторий и получать обновления.

Проверка:

```powershell
git --version
```

### 4. OpenSSH Client — обязательно

Обычно уже стоит в Windows 10/11. Проверить:

```powershell
ssh -V
```

Если «не найден» — Windows → Параметры → Приложения → Дополнительные
компоненты → «Клиент OpenSSH» → Установить. Или через PowerShell
(от админа):

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

### 5. Ollama — опционально

Скачать: https://ollama.com/download

Зачем: локальная LLM для генерации тестов. **Если не поставишь —
платформа всё равно работает**, вопросы берутся из готового пула
(10 штук), просто без нейросети.

Если поставишь — после установки обязательно скачай модель:

```powershell
ollama pull llama3.1:8b
```

Это ~5 ГБ, качается 5–20 минут в зависимости от интернета. Один раз.

Проверка, что модель встала:

```powershell
ollama list
```

Должна быть строка с `llama3.1:8b`.

---

## Часть 2. Быстрая проверка, что всё готово

Открой PowerShell и вставь:

```powershell
docker --version
node --version
git --version
ssh -V
```

Смотришь на ответы. Если все четыре что-то ответили — **ты готов**.
Если что-то не ответило — вернись в Часть 1, найди эту программу,
поставь.

Оллама проверяется отдельно, если ставил:

```powershell
ollama list
```

---

## Часть 3. SSH-ключ к серверу

Сервер `31.185.105.155` принимает только по ключу, пароль отключён.

**Ты уже знаешь, что такое SSH-ключ?** Проверяй:

```powershell
ssh root@31.185.105.155 "echo ok"
```

- Если вывело `ok` → всё готово, иди в Часть 4.
- Если `Permission denied` → ключ не подложен на сервер, зови того,
  кто настраивал. Или клади сам, см. ниже.

**Ты не знаешь, что такое SSH-ключ?** Делай по шагам:

1. Сгенерируй ключ (если ещё нет):

```powershell
ssh-keygen -t rsa -b 4096
```

На все вопросы жми **Enter**. На вопрос про «passphrase» — **тоже
Enter**, парольная фраза тут не нужна.

2. Посмотри свой публичный ключ:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_rsa.pub
```

Выведет длинную строку типа `ssh-rsa AAAAB3NzaC1y... user@pc`.

3. Отправь эту строку тому, кто настраивал сервер. Он положит её в
   `~/.ssh/authorized_keys` рута.

4. Проверь снова: `ssh root@31.185.105.155 "echo ok"` → должно быть `ok`.

---

## Часть 4. Какие скрипты есть и что они делают

Все скрипты — в папке `scripts\`. Плюс два в корне. Запускаются так:

```powershell
powershell -ExecutionPolicy Bypass -File .\<путь-к-скрипту>.ps1
```

Ниже — что каждый делает **по-простому**.

### Обязательные для начала

| Скрипт | Что делает простыми словами |
|---|---|
| `scripts\setup.ps1` | Спрашивает 3 вопроса, генерирует 4 пароля, создаёт файлы конфигурации. Запускается **один раз** после клона репозитория. |
| `deploy.ps1` | Полный деплой на сервер. **Стирает БД.** Используется в первый раз и после крупных изменений схемы. |
| `deploy_up.ps1` | Деплой без сброса БД. **Это то, что ты будешь запускать 99% времени.** |
| `scripts\menu.ps1` | Меню со всеми кнопками. Если забыл, что делать — открывай его. |

### Полезные

| Скрипт | Что делает простыми словами |
|---|---|
| `scripts\doctor.ps1` | Проверка здоровья: ssh, docker, контейнеры, health. Запускай, когда что-то не работает. |
| `scripts\status.ps1` | Показать статус контейнеров + health. С `-Logs -Follow` — живой хвост логов. |
| `scripts\rotate.ps1` | Сменить пароли. `-What db` — только БД, `-What jwt` — только токены, `-What all` — всё. |
| `scripts\fix-tunnel.ps1` | Если туннель циклически переподключается с кодом 4001 — пересоздать контейнер с актуальным секретом. |
| `scripts\backup.ps1` | Сделать бэкап БД с сервера. `-Restore <файл>` или `-Restore latest` — восстановить. |
| `scripts\start-tunnel.ps1` | Поднять Ollama-туннель (LLM). Оставь окно открытым. |
| `scripts\stop-tunnel.ps1` | Остановить туннель. |

### Прочие

| Скрипт | Что делает |
|---|---|
| `scripts\gen-env.ps1` | Обновить `.env` после смены секретов. `-Rotate` — только секреты, `-Force` — перезаписать целиком. |
| `scripts\reset-db.ps1` | **Только локально.** Сбрасывает локальный Postgres через docker compose. На сервере не работает. |
| `scripts\debug-llm.js` | Диагностика LLM. Нужен, если тесты не генерируются и хочется понять почему. |

---

## Часть 5. Порядок действий с нуля

Пять шагов, по одному скрипту на шаг.

### Шаг 1. Клон репозитория

```powershell
cd F:\
git clone <URL-репозитория> hhru
cd F:\hhru
```

### Шаг 2. Первичная настройка

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

Спросит 3 вопроса. На все три просто жми **Enter** — там дефолтные
значения для нашего сервера.

В конце увидишь:

```
OK: Конфиг:  F:\hhru\.deploy-config.json
OK: Секреты: F:\hhru\.deploy-secrets.json
OK: SSH работает
```

### Шаг 3. Первый деплой

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

Ждать 2–5 минут. В конце:

```
OK: Готово (БД пересоздана): http://31.185.105.155/
```

Открой этот адрес в браузере — увидишь страницу входа.

### Шаг 4. Туннель (только если ставил Ollama)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-tunnel.ps1
```

**Оставь окно открытым.** Это и есть туннель — пока оно открыто,
платформа видит Ollama. Ctrl+C — остановить.

Если в логе видишь `соединение закрыто (код 4001)` — запусти
`scripts\fix-tunnel.ps1` и попробуй снова.

### Шаг 5. Дальше — только меню

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\menu.ps1
```

Меню с цифрами. Выбираешь, что нужно. Всё.

---

## Часть 6. Частые операции «в один клик»

### Обновил код, хочу залить на сервер

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy_up.ps1
```

### Что-то не работает, хочу понять почему

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor.ps1
```

### Хочу посмотреть живые логи

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\status.ps1 -Logs -Follow
```

Ctrl+C — выйти.

### Хочу сменить пароль от БД

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\rotate.ps1 -What db
```

### Хочу бэкап перед рискованной операцией

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1
```

Дамп появится в `backups\fsp-YYYY-MM-DD_HH-mm-ss.sql.gz`.

### Хочу восстановить из последнего бэкапа

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1 -Restore latest
```

### Туннель циклически переподключается (код 4001)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\fix-tunnel.ps1
```

Потом перезапусти `scripts\start-tunnel.ps1`.

### Хочу запустить LLM-туннель

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-tunnel.ps1
```

### Не помню, что делать — открыть меню

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\menu.ps1
```

---

## Часть 7. Где лежат пароли

В файле **`F:\hhru\.deploy-secrets.json`**. Открыть:

```powershell
notepad .\.deploy-secrets.json
```

Внутри:

```json
{
  "POSTGRES_PASSWORD":  "...",
  "JWT_ACCESS_SECRET":  "...",
  "JWT_REFRESH_SECRET": "...",
  "TUNNEL_SECRET":      "..."
}
```

**`POSTGRES_PASSWORD`** — это пароль от PostgreSQL. Он же используется
на сервере внутри контейнера `fsp-postgres`. Если хочешь зайти в БД
руками — вот он.

Этот файл в `.gitignore`, в репозиторий не попадёт. **Не выкладывай
его никуда.**

**Не редактируй его руками** — иначе контейнеры на VPS не узнают про
изменения, и получится рассинхрон (см. `fix-tunnel.ps1` для случая с
`TUNNEL_SECRET`). Для смены паролей используй `rotate.ps1`.

---

## Часть 8. Три самые частые проблемы

### `docker: command not found`

Docker Desktop закрыт. Открой, дождись зелёного кита в трее.

### `ssh: Permission denied (publickey)`

Ключ не подложен на сервер. См. Часть 3.

### `502 Bad Gateway` в браузере

App не поднялся. Смотри логи:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\status.ps1 -Logs -Container fsp-app -Tail 100
```

Если там пусто — жди 10 секунд, БД ещё стартует. Если ошибки —
доктор:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor.ps1
```

---

## Часть 9. Что НЕ надо трогать руками

Три файла, которые создают скрипты. Не редактируй их вручную, если
не уверен:

| Файл | Кто создаёт | Что там |
|---|---|---|
| `.deploy-config.json` | `setup.ps1` | адрес сервера, порты, лимиты |
| `.deploy-secrets.json` | `setup.ps1` / `rotate.ps1` | пароли |
| `.env` | `gen-env.ps1` | переменные окружения для локального запуска |

Все три — в `.gitignore`. Руками править можно, но лучше через скрипты.