import express from 'express';
import pool from './db.js';
import catalogRouter from './modules/catalog/catalog.router.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false }));

// --- health ---
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    console.error('[fsp] /ready failed', err.message);
    res.status(503).json({ ok: false, error: 'db_unavailable' });
  }
});

// --- публичный конфиг ---
app.get('/api/v1/config', (_req, res) => {
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

// --- API v1 ---
app.use('/api/v1/catalog', catalogRouter);

// --- заглушки авторизации ---
app.post('/api/v1/auth/login',    (_req, res) => res.status(501).json({ error: 'not_implemented' }));
app.post('/api/v1/auth/register', (_req, res) => res.status(501).json({ error: 'not_implemented' }));

// --- 404 ---
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// --- централизованный обработчик ошибок ---
app.use((err, _req, res, _next) => {
  console.error('[fsp] error', err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[fsp] listening on http://0.0.0.0:${PORT}`);
});