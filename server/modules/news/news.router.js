import { Router } from 'express';
import { z, ZodError } from 'zod';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as repo from './news.repo.js';

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

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body:  z.string().trim().min(1).max(10000),
});

const idSchema = z.string().uuid();

// Публичный список новостей — доступен всем
router.get('/', handle(async (_req, res) => {
  res.json({ items: await repo.listPosts() });
}));

router.post('/', requireAuth, requireRole('admin'), handle(async (req, res) => {
  const body = createSchema.parse(req.body);
  const post = await repo.insertPost({ ...body, authorId: req.user.id });
  res.status(201).json({ post });
}));

router.delete('/:id', requireAuth, requireRole('admin'), handle(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const ok = await repo.deletePost(id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
}));

export default router;