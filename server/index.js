import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false }));

// --- health для HEALTHCHECK и docker-compose ---
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// --- публичный конфиг для фронта (в т.ч. настройки Keycloak) ---
app.get('/api/config', (_req, res) => {
  res.json({
    appName: 'ФСП · Платформа ИТ-вакансий',
    keycloak: {
      enabled: process.env.KEYCLOAK_ENABLED === 'true',
      url:     process.env.KEYCLOAK_URL     || '',
      realm:   process.env.KEYCLOAK_REALM   || 'fsp',
      clientId:process.env.KEYCLOAK_CLIENT_ID || 'fsp-web',
    },
  });
});

// --- заглушки авторизации (кнопки пока не рабочие) ---
app.post('/api/auth/login',    (_req, res) => res.status(501).json({ error: 'not_implemented' }));
app.post('/api/auth/register', (_req, res) => res.status(501).json({ error: 'not_implemented' }));

// --- статика ---
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', etag: true }));

// --- keycloak-js из node_modules, чтобы не тянуть CDN ---
app.use('/vendor/keycloak', express.static(
  path.join(__dirname, '..', 'node_modules', 'keycloak-js', 'dist'),
));

// --- SPA fallback ---
// app.get('*', (_req, res) => {
//   res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
// });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[fsp] listening on http://0.0.0.0:${PORT}`);
});