import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false }));

// --- health для nginx (location = /health), HEALTHCHECK и docker-compose ---
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// --- публичный конфиг для фронта (в т.ч. настройки Keycloak) ---
//     keycloak.enabled=false по умолчанию: SSO включается флагом после хакатона
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
//     Реальная реализация: bcrypt + JWT/sessions, PostgreSQL — Post-MVP
app.post('/api/auth/login',    (_req, res) => res.status(501).json({ error: 'not_implemented' }));
app.post('/api/auth/register', (_req, res) => res.status(501).json({ error: 'not_implemented' }));

// --- всё остальное — 404 JSON ---
//     Статику (/, /styles.css, /app.js, /vendor/*) отдаёт nginx из /app/public.
//     SPA-fallback и раздача файлов — на стороне nginx (try_files ... /index.html).
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[fsp] listening on http://0.0.0.0:${PORT}`);
});