// tunnel/client.js
// Клиент туннеля. Запускается на домашнем ПК рядом с Ollama.
//
// Что делает:
//   1. Проверяет, что Ollama отвечает на OLLAMA_LOCAL.
//   2. Если нет — стартует `ollama serve` (если START_OLLAMA != false).
//   3. Проверяет наличие модели LLM_MODEL; если нет — `ollama pull`.
//   4. Открывает WS к VPS и проксирует HTTP-запросы /api/* к локальной Ollama.
//   5. При обрыве переподключается с экспоненциальным backoff.

import WebSocket from 'ws';
import { spawn } from 'node:child_process';

const VPS_URL       = process.env.VPS_TUNNEL_URL || '';
const TUNNEL_SECRET = process.env.TUNNEL_SECRET  || '';
const OLLAMA_LOCAL  = process.env.OLLAMA_LOCAL   || 'http://127.0.0.1:11434';
const OLLAMA_CMD    = process.env.OLLAMA_CMD     || 'ollama';
const MODEL         = process.env.LLM_MODEL      || 'llama3.1:8b';
const START_OLLAMA  = process.env.START_OLLAMA  !== 'false';
const PULL_MODEL    = process.env.OLLAMA_PULL_MODEL !== 'false';

if (!VPS_URL || !TUNNEL_SECRET) {
  console.error('[client] Задай VPS_TUNNEL_URL и TUNNEL_SECRET');
  process.exit(1);
}

let ollamaProc = null;
let spawnedByUs = false;

/* ---------- вспомогательное ---------- */

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
  });
}

async function isOllamaUp() {
  try {
    const r = await fetch(`${OLLAMA_LOCAL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function getLocalModels() {
  try {
    const r = await fetch(`${OLLAMA_LOCAL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.models || []).map(m => m.name);
  } catch {
    return [];
  }
}

/* ---------- подъём Ollama ---------- */

async function ensureOllama() {
  if (await isOllamaUp()) {
    console.log('[client] Ollama уже запущена');
    return;
  }

  if (!START_OLLAMA) {
    throw new Error('Ollama недоступна и START_OLLAMA=false');
  }

  console.log(`[client] Запускаю "${OLLAMA_CMD} serve"…`);
  ollamaProc = spawn(OLLAMA_CMD, ['serve'], { stdio: 'inherit', detached: false });
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

/* ---------- автоподкачка модели ---------- */

async function ensureModel() {
  if (!PULL_MODEL) return;

  const models = await getLocalModels();
  const has = models.some(n => n === MODEL || n.startsWith(MODEL + ':'));
  if (has) {
    console.log(`[client] модель ${MODEL} найдена`);
    return;
  }

  console.log(`[client] модель ${MODEL} не найдена — качаю (это займёт время)…`);
  await runCmd(OLLAMA_CMD, ['pull', MODEL]);
  console.log(`[client] модель ${MODEL} загружена`);
}

/* ---------- WebSocket ---------- */

let ws = null;
let attempt = 0;
const BACKOFF_BASE = 2000;
const BACKOFF_MAX  = 30000;

function backoffMs() {
  const ms = Math.min(BACKOFF_MAX, BACKOFF_BASE * Math.pow(1.6, attempt));
  return Math.round(ms);
}

function connect() {
  const delay = attempt === 0 ? 0 : backoffMs();
  if (delay) console.log(`[client] переподключение через ${Math.round(delay / 1000)} с…`);

  setTimeout(() => {
    console.log('[client] подключаюсь к', VPS_URL);
    ws = new WebSocket(VPS_URL, { headers: { 'x-tunnel-secret': TUNNEL_SECRET } });

    ws.on('open', () => {
      attempt = 0;
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
          type: 'response',
          id:   msg.id,
          status:  r.status,
          headers: { 'content-type': r.headers.get('content-type') || 'application/json' },
          body: text,
        }));
      } catch (err) {
        try {
          ws.send(JSON.stringify({
            type: 'response',
            id:   msg.id,
            status: 500,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ error: 'ollama_error', message: err.message }),
          }));
        } catch (_) {}
      }
    });

    ws.on('close', (code) => {
      console.log(`[client] соединение закрыто (код ${code})`);
      attempt++;
      connect();
    });

    ws.on('error', (err) => {
      console.error('[client] ws error:', err.message);
    });
  }, delay);
}

/* ---------- уборка ---------- */

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

/* ---------- старт ---------- */

(async () => {
  try {
    await ensureOllama();
    await ensureModel();
  } catch (err) {
    console.error('[client]', err.message);
    process.exit(1);
  }
  connect();
})();