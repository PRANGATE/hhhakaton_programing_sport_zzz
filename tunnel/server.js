/**
 * Туннель-сервер. Работает на VPS.
 *
 * - WS :4010     — сюда стучится локальный клиент (Ollama на домашнем ПК).
 * - HTTP :11434  — псевдо-Ollama; сюда ходит fsp-app.
 *
 * Если клиент не подключён, HTTP отвечает 503.
 * Если клиент подключён — HTTP-запрос инкапсулируется в JSON,
 * уходит по WS, там выполняется к локальной Ollama, ответ возвращается
 * тем же путём.
 */

import { WebSocketServer } from 'ws';
import http from 'node:http';
import crypto from 'node:crypto';

const WS_PORT       = Number(process.env.TUNNEL_PORT || 4010);
const API_PORT      = Number(process.env.TUNNEL_API_PORT || 11434);
const TUNNEL_SECRET = process.env.TUNNEL_SECRET || '';

if (!TUNNEL_SECRET) {
  console.error('[tunnel] TUNNEL_SECRET не задан — отказываюсь стартовать');
  process.exit(1);
}

let activeClient = null;
const pending = new Map();   // id → { resolve, reject, timer }

/* ---------- WebSocket ---------- */

const wss = new WebSocketServer({ port: WS_PORT, path: '/ollama-tunnel' });

wss.on('connection', (ws, req) => {
  const secret = req.headers['x-tunnel-secret'];
  if (secret !== TUNNEL_SECRET) {
    console.warn('[tunnel] отклонён клиент без корректного секрета');
    ws.close(4001, 'forbidden');
    return;
  }

  if (activeClient && activeClient.readyState === activeClient.OPEN) {
    console.log('[tunnel] заменяю активного клиента');
    try { activeClient.close(4002, 'replaced'); } catch {}
  }

  activeClient = ws;
  console.log('[tunnel] клиент подключён:', req.socket.remoteAddress);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString('utf8')); }
    catch { return; }

    if (msg.type !== 'response') return;

    const p = pending.get(msg.id);
    if (!p) return;

    clearTimeout(p.timer);
    pending.delete(msg.id);
    p.resolve(msg);
  });

  ws.on('close', () => {
    if (activeClient === ws) activeClient = null;
    console.log('[tunnel] клиент отключён');

    // отменяем все ожидающие запросы
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error('tunnel_closed'));
      pending.delete(id);
    }
  });

  ws.on('error', (err) => console.error('[tunnel] ws error:', err.message));
});

console.log(`[tunnel] WebSocket ждёт клиента на :${WS_PORT}/ollama-tunnel`);

/* ---------- HTTP-фасад Ollama ---------- */

const apiServer = http.createServer(async (req, res) => {
  // Только API, никакой статики
  if (!req.url.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  if (!activeClient || activeClient.readyState !== activeClient.OPEN) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'tunnel_unavailable',
      message: 'Ollama tunnel is not connected',
    }));
    return;
  }

  // читаем тело
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');

  const id = crypto.randomUUID();
  const payload = {
    type:    'request',
    id,
    method:  req.method,
    url:     req.url,
    headers: Object.fromEntries(
      Object.entries(req.headers)
        .filter(([k]) => !['host', 'connection', 'content-length'].includes(k))
    ),
    body,
  };

  let response;
  try {
    response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('tunnel_timeout'));
      }, 120_000); // 2 минуты, Ollama на CPU может думать долго

      pending.set(id, { resolve, reject, timer });
      activeClient.send(JSON.stringify(payload));
    });
  } catch (err) {
    res.writeHead(504, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'tunnel_error', message: err.message }));
    return;
  }

  res.writeHead(response.status || 200, response.headers || { 'content-type': 'application/json' });
  res.end(response.body || '');
});

apiServer.listen(API_PORT, '0.0.0.0', () => {
  console.log(`[tunnel] HTTP-фасад Ollama слушает на :${API_PORT}`);
});