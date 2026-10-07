import { Router } from 'express';
import { z, ZodError } from 'zod';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as repo from './profile.repo.js';

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

const candidateSchema = z.object({
  full_name:         z.string().trim().max(200).optional(),
  telegram:          z.string().trim().max(100).optional(),
  phone:             z.string().trim().max(40).optional(),
  about:             z.string().max(2000).optional(),
  experience_years:  z.number().min(0).max(60).optional(),
  industry_id:       z.string().max(60).optional(),
  specialization_id: z.string().max(60).optional(),
  target_grade_id:   z.enum(['junior','middle','senior']).optional(),
  roles:             z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  stacks:            z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  soft_skills:       z.array(z.string()).optional(),
  visibility:        z.object({}).passthrough().optional(),
}).strict();

const employerSchema = z.object({
  company_name:     z.string().trim().min(1).max(200),
  industry_id:      z.string().max(60).optional(),
  contact_person:   z.string().max(200).optional(),
  contact_email:    z.string().email().optional(),
  contact_telegram: z.string().max(100).optional(),
  contact_phone:    z.string().max(40).optional(),
  default_channel:  z.enum(['telegram','email','phone']).optional(),
  description:      z.string().max(4000).optional(),
}).strict();

router.get('/me', requireAuth, handle(async (req, res) => {
  const table = req.user.role === 'candidate' ? repo.getCandidate : repo.getEmployer;
  res.json({ profile: await table(req.user.id) });
}));

router.patch('/me', requireAuth, handle(async (req, res) => {
  if (req.user.role === 'candidate') {
    const patch = candidateSchema.parse(req.body);
    res.json({ profile: await repo.upsertCandidate(req.user.id, patch) });
  } else if (req.user.role === 'employer') {
    const patch = employerSchema.parse(req.body);
    res.json({ profile: await repo.upsertEmployer(req.user.id, patch) });
  } else {
    res.status(403).json({ error: 'forbidden' });
  }
}));

// Отрасль в БД не храним отдельной таблицей — это заглушка справочника.
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