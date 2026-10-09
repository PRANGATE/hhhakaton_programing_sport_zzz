/**
 * Клиент туннеля. Работает на домашнем ПК.
 *
 * 1. Проверяет, что Ollama жива на http://127.0.0.1:11434.
 * 2. Если нет — запускает `ollama serve`.
 * 3. Устанавливает WebSocket-соединение с VPS.
 * 4. Принимает запросы от VPS, выполняет их к локальной Ollama,
 *    возвращает ответ.
 * 5. При разрыве — переподключается автоматически.
 *
 * Запуск:
 *   VPS_TUNNEL_URL=ws://31.185.105.155:4010/ollama-tunnel \
 *   TUNNEL_SECRET=xxx \
 *   node tunnel/client.js
 */

import WebSocket from 'ws';
import { spawn } from 'node:child_process';

const VPS_URL       = process.env.VPS_TUNNEL_URL || '';
const TUNNEL_SECRET = process.env.TUNNEL_SECRET  || '';
const OLLAMA_LOCAL  = process.env.OLLAMA_LOCAL   || 'http://127.0.0.1:11434';
const OLLAMA_CMD    = process.env.OLLAMA_CMD     || 'ollama';
const START_OLLAMA  = process.env.START_OLLAMA !== 'false';

if (!VPS_URL || !TUNNEL_SECRET) {
  console.error('[client] Задай VPS_TUNNEL_URL и TUNNEL_SECRET');
  process.exit(1);
}

let ollamaProc = null;
let spawnedByUs = false;

/* ---------- Ollama ---------- */

async function isOllamaUp() {
  try {
    const r = await fetch(`${OLLAMA_LOCAL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureOllama() {
  if (await isOllamaUp()) {
    console.log('[client] Ollama уже запущена');
    return;
  }

  if (!START_OLLAMA) {
    throw new Error('Ollama недоступна и START_OLLAMA=false');
  }

  console.log(`[client] Запускаю "${OLLAMA_CMD} serve"…`);
  ollamaProc = spawn(OLLAMA_CMD, ['serve'], {
    stdio: 'inherit',
    detached: false,
  });
  spawnedByUs = true;

  ollamaProc.on('error', (err) => {
    console.error('[client] Не удалось запустить Ollama:', err.message);
    console.error('[client] Убедись, что ollama установлена и доступна в PATH.');
    process.exit(1);
  });

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await isOllamaUp()) {
      console.log('[client] Ollama готова');
      return;
    }
  }
  throw new Error('Ollama не поднялась за 30 секунд');
}

/* ---------- WebSocket ---------- */

let ws = null;

function connect() {
  console.log('[client] подключаюсь к', VPS_URL);
  ws = new WebSocket(VPS_URL, {
    headers: { 'x-tunnel-secret': TUNNEL_SECRET },
  });

  ws.on('open', () => {
    console.log('[client] ✓ туннель установлен');
  });

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString('utf8')); }
    catch { return; }

    if (msg.type !== 'request') return;

    try {
      const r = await fetch(OLLAMA_LOCAL + msg.url, {
        method:  msg.method,
        headers: { ...msg.headers },
        body:    msg.body || undefined,
        signal:  AbortSignal.timeout(120_000),
      });

      const text = await r.text();
      ws.send(JSON.stringify({
        type:    'response',
        id:      msg.id,
        status:  r.status,
        headers: { 'content-type': r.headers.get('content-type') || 'application/json' },
        body:    text,
      }));
    } catch (err) {
      ws.send(JSON.stringify({
        type:    'response',
        id:      msg.id,
        status:  500,
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ error: 'ollama_error', message: err.message }),
      }));
    }
  });

  ws.on('close', (code) => {
    console.log(`[client] соединение закрыто (код ${code}), переподключение через 5с`);
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    console.error('[client] ws error:', err.message);
  });
}

/* ---------- Уборка ---------- */

function shutdown(signal) {
  console.log(`[client] получен ${signal}, выключаюсь…`);
  try { ws?.close(); } catch {}
  if (spawnedByUs && ollamaProc && !ollamaProc.killed) {
    try { ollamaProc.kill(); } catch {}
  }
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/* ---------- Старт ---------- */

(async () => {
  try {
    await ensureOllama();
  } catch (err) {
    console.error('[client]', err.message);
    process.exit(1);
  }
  connect();
})();