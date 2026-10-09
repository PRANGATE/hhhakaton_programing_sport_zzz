import { Router } from 'express';
import { z, ZodError } from 'zod';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as repo from './admin.repo.js';

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
    next(err);
  }
};

const idSchema = z.string().uuid();

// Всё, что ниже — только администратор.
router.use(requireAuth, requireRole('admin'));

router.get('/candidates', handle(async (_req, res) => {
  res.json({ items: await repo.listCandidates() });
}));

router.get('/employers', handle(async (_req, res) => {
  res.json({ items: await repo.listEmployers() });
}));

router.delete('/candidates/:userId', handle(async (req, res) => {
  const id = idSchema.parse(req.params.userId);
  const ok = await repo.deleteUser(id, 'candidate');
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
}));

router.delete('/employers/:userId', handle(async (req, res) => {
  const id = idSchema.parse(req.params.userId);
  const ok = await repo.deleteUser(id, 'employer');
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
}));

export default router;