import { Router } from 'express';
import { ZodError } from 'zod';
import * as svc from './auth.service.js';
import * as schemas from './auth.schemas.js';
import { requireAuth } from './auth.middleware.js';

const router = Router();

// централизованная обработка Zod-ошибок
const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
      });
    }
    if (err.code === 'EMAIL_TAKEN')          return res.status(409).json({ error: 'email_taken' });
    if (err.code === 'INVALID_CREDENTIALS')  return res.status(401).json({ error: 'invalid_credentials' });
    if (err.code === 'INVALID_REFRESH')      return res.status(401).json({ error: 'invalid_refresh' });
    next(err);
  }
};

const clientCtx = (req) => ({
  ip: req.headers['x-real-ip'] || req.ip,
  userAgent: req.headers['user-agent'] || null,
});

router.post('/register', handle(async (req, res) => {
  const body = schemas.registerSchema.parse(req.body);
  const out = await svc.register({ ...body, ...clientCtx(req) });
  res.status(201).json(out);
}));

router.post('/login', handle(async (req, res) => {
  const body = schemas.loginSchema.parse(req.body);
  const out = await svc.login({ ...body, ...clientCtx(req) });
  res.json(out);
}));

router.post('/refresh', handle(async (req, res) => {
  const { refreshToken } = schemas.refreshSchema.parse(req.body);
  const out = await svc.refresh({ refreshToken, ...clientCtx(req) });
  res.json(out);
}));

router.post('/logout', handle(async (req, res) => {
  await svc.logout(req.body?.refreshToken);
  res.status(204).end();
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;