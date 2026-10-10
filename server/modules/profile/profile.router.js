import { Router } from 'express';
import { z, ZodError } from 'zod';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as repo from './profile.repo.js';
import * as authRepo from '../auth/auth.repo.js';

const router = Router();

const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
      });
    }
    console.error('[profile] error:', err.message, err.stack);
    next(err);
  }
};

// === Хелперы ===
const emptyToUndef = (v) => (v === '' || v === null ? undefined : v);

const optStr = (max) =>
  z.preprocess(emptyToUndef, z.string().trim().max(max).optional());

const optNum = (min, max) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(min).max(max).optional()
  );

// === Схемы ===

const candidateSchema = z.object({
  full_name:         optStr(200),
  telegram:          optStr(100),
  phone:             optStr(40),
  about:             optStr(2000),
  experience_years:  optNum(0, 60),
  industry_id:       optStr(60),
  specialization_id: optStr(60),
  target_grade_id:   z.preprocess(emptyToUndef, z.enum(['junior', 'middle', 'senior']).optional()),
  // ФСП ID из настроек. Пустая строка → undefined (отвязка через отдельный флаг
  // не нужна: PATCH со значением null явно очистит колонку).
  fsp_id:            z.preprocess(
    (v) => (v === '' ? null : v === undefined ? undefined : String(v).trim()),
    z.string().max(100).nullable().optional()
  ),
  roles:             z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  stacks:            z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  soft_skills:       z.array(z.string()).optional(),
  visibility:        z.object({}).passthrough().optional(),
}).strict();

const employerSchema = z.object({
  company_name:     z.string().trim().min(1).max(200),
  industry_id:      optStr(60),
  contact_person:   optStr(200),
  contact_email:    z.preprocess(emptyToUndef, z.string().email().optional()),
  contact_telegram: optStr(100),
  contact_phone:    optStr(40),
  default_channel:  z.preprocess(emptyToUndef, z.enum(['telegram', 'email', 'phone']).optional()),
  description:      optStr(4000),
}).strict();

const consentSchema = z.object({
  kind:    z.enum(['processing', 'publish']),
  version: z.string().trim().min(1).max(20).default('v1'),
});

// === Профиль ===

router.get('/me', requireAuth, handle(async (req, res) => {
  const table = req.user.role === 'candidate' ? repo.getCandidate : repo.getEmployer;
  res.json({ profile: await table(req.user.id) });
}));

router.patch('/me', requireAuth, handle(async (req, res) => {
  if (req.user.role === 'candidate') {
    const patch = candidateSchema.parse(req.body);
    // Убираем только undefined (не трогали), но оставляем null (явная очистка).
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    );
    res.json({ profile: await repo.upsertCandidate(req.user.id, clean) });
  } else if (req.user.role === 'employer') {
    const patch = employerSchema.parse(req.body);
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    );
    res.json({ profile: await repo.upsertEmployer(req.user.id, clean) });
  } else {
    res.status(403).json({ error: 'forbidden' });
  }
}));

// === Согласия (152-ФЗ) ===
// Показываем только то, что уже принято. Регистрация автоматически
// записывает 'processing'; 'publish' пользователь включает сам.

router.get('/consents', requireAuth, handle(async (req, res) => {
  res.json({ items: await authRepo.listConsents(req.user.id) });
}));

router.post('/consents', requireAuth, handle(async (req, res) => {
  const body = consentSchema.parse(req.body);
  await authRepo.insertConsent({
    userId: req.user.id,
    kind: body.kind,
    version: body.version,
    ip: req.headers['x-real-ip'] || req.ip || null,
  });
  res.status(201).json({ items: await authRepo.listConsents(req.user.id) });
}));

// === Справочники (заглушка) ===

router.get('/industries', (_req, res) => {
  res.json({ items: [
    { id: 'fintech',    name: 'Финтех' },
    { id: 'ecom',       name: 'E-commerce' },
    { id: 'gov',        name: 'Госсектор' },
    { id: 'medtech',    name: 'Медтех' },
    { id: 'telecom',    name: 'Телеком' },
    { id: 'logistics',  name: 'Логистика' },
    { id: 'gamedev',    name: 'GameDev' },
    { id: 'other',      name: 'Другое' },
  ]});
});

export default router;