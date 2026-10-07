import { Router } from 'express';
import { ZodError } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import * as svc from './invite.service.js';
import * as s   from './invite.schemas.js';

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
    if (err.code === 'NOT_FOUND')      return res.status(404).json({ error: 'not_found' });
    if (err.code === 'FORBIDDEN')      return res.status(403).json({ error: 'forbidden' });
    if (err.code === 'ALREADY_CLOSED') return res.status(409).json({ error: 'already_closed' });
    next(err);
  }
};

router.get('/', requireAuth, handle(async (req, res) => {
  res.json({ items: await svc.listMine({ userId: req.user.id, role: req.user.role }) });
}));

router.get('/:id', requireAuth, handle(async (req, res) => {
  res.json({ invitation: await svc.getOne({ id: req.params.id, userId: req.user.id, role: req.user.role }) });
}));

router.post('/', requireAuth, handle(async (req, res) => {
  if (req.user.role !== 'employer') return res.status(403).json({ error: 'forbidden' });
  const body = s.createInvitationSchema.parse(req.body);
  const inv  = await svc.create({ employerId: req.user.id, data: body });
  res.status(201).json({ invitation: inv });
}));

router.patch('/:id/status', requireAuth, handle(async (req, res) => {
  const { status } = s.statusSchema.parse(req.body);
  const inv = await svc.setStatus({
    id: req.params.id, userId: req.user.id, role: req.user.role, status,
  });
  res.json({ invitation: inv });
}));

export default router;