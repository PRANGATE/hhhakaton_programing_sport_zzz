import { Router } from 'express';
import { z, ZodError } from 'zod';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as svc from './test.service.js';

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
    if (err.code === 'GRADE_CHANGE_LOCKED') return res.status(429).json({
      error: 'grade_change_locked',
      message: 'Смена грейда доступна раз в 3 месяца',
    });
    if (err.code === 'NOT_ENOUGH_QUESTIONS') return res.status(503).json({ error: 'not_enough_questions' });
    if (err.code === 'NOT_FOUND')             return res.status(404).json({ error: 'not_found' });
    if (err.code === 'ATTEMPT_CLOSED')        return res.status(409).json({ error: 'attempt_closed' });
    if (err.code === 'LLM_UNAVAILABLE') return res.status(503).json({
      error:   'llm_unavailable',
      message: 'Сервер не выдал задания, попробуйте позже',
    });
    next(err);
  }
};

const startSchema = z.object({
  specialization_id: z.enum(['backend','frontend','mobile','data-analytics','devops','qa','infosec','gamedev']),
  target_grade_id:   z.enum(['junior','middle','senior']),
});

const answerSchema = z.object({
  question_id: z.string().uuid(),
  payload:     z.object({}).passthrough(),
});

// ВАЖНО: body приходит в snake_case (как требует ТЗ/фронт),
// а сервис работает в camelCase — мапим явно.
router.post('/start', requireAuth, requireRole('candidate'), handle(async (req, res) => {
  const body = startSchema.parse(req.body);
  const out = await svc.startAttempt({
    userId:           req.user.id,
    specializationId: body.specialization_id,
    targetGradeId:    body.target_grade_id,
  });
  res.status(201).json(out);
}));

router.post('/:id/answers', requireAuth, requireRole('candidate'), handle(async (req, res) => {
  const { question_id, payload } = answerSchema.parse(req.body);
  res.json(await svc.submitAnswer({
    attemptId:  req.params.id,
    userId:     req.user.id,
    questionId: question_id,
    payload,
  }));
}));

router.post('/:id/finish', requireAuth, requireRole('candidate'), handle(async (req, res) => {
  res.json(await svc.finishAttempt({
    attemptId: req.params.id,
    userId:    req.user.id,
  }));
}));

export default router;