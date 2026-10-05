import express from 'express';
import pool from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false }));

// --- liveness: процесс жив ---
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// --- readiness: готов принимать (проверка БД) ---
app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    console.error('[fsp] /ready failed', err.message);
    res.status(503).json({ ok: false, error: 'db_unavailable' });
  }
});

// --- публичный конфиг для фронта (в т.ч. настройки Keycloak) ---
app.get('/api/config', (_req, res) => {
  res.json({
    appName: 'ФСП · Платформа ИТ-вакансий',
    keycloak: {
      enabled: process.env.KEYCLOAK_ENABLED === 'true',
      url:     process.env.KEYCLOAK_URL       || '',
      realm:   process.env.KEYCLOAK_REALM     || 'fsp',
      clientId:process.env.KEYCLOAK_CLIENT_ID || 'fsp-web',
    },
  });
});

// --- заглушки авторизации (MVP) ---
app.post('/api/auth/login',    (_req, res) => res.status(501).json({ error: 'not_implemented' }));
app.post('/api/auth/register', (_req, res) => res.status(501).json({ error: 'not_implemented' }));

// --- всё остальное — 404 JSON ---
//     Статику отдаёт nginx; сюда доходят только API-пути.
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[fsp] listening on http://0.0.0.0:${PORT}`);
});