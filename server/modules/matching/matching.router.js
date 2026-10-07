import { Router } from 'express';
import { z, ZodError } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { MOCK_CANDIDATES, scoreCandidate, explain } from './matching.mock.js';

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

const querySchema = z.object({
  specialization: z.string().optional(),
  grade:          z.string().optional(),
  stack:          z.array(z.string()).optional(),
  only_fsp:       z.boolean().optional(),
});

// POST /api/v1/matching/query — подборка под потребность
router.post('/query', requireAuth, handle(async (req, res) => {
  if (req.user.role !== 'employer') return res.status(403).json({ error: 'forbidden' });
  const need = querySchema.parse(req.body);

  let list = MOCK_CANDIDATES.slice();
  if (need.specialization) list = list.filter(c => c.specialization === need.specialization);
  if (need.grade)          list = list.filter(c => c.grade === need.grade);
  if (need.only_fsp)       list = list.filter(c => c.fsp.length > 0);

  const ranked = list
    .map(c => {
      const s = scoreCandidate(c, need);
      return {
        id: c.id, anon_id: c.anon_id,
        specialization: c.specialization, grade: c.grade,
        test_score: c.test_score, stacks: c.stacks,
        has_fsp: c.fsp.length > 0,
        score: Math.round(s.score * 100),
        explanation: explain(c, s),
      };
    })
    .sort((a, b) => b.score - a.score);

  res.json({ items: ranked, need });
}));

// GET /api/v1/matching/candidates/:id — карточка кандидата
router.get('/candidates/:id', requireAuth, handle(async (req, res) => {
  if (req.user.role !== 'employer') return res.status(403).json({ error: 'forbidden' });
  const c = MOCK_CANDIDATES.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });

  // Контакты НЕ отдаём: только анонимный ID.
  res.json({
    candidate: {
      id: c.id,
      anon_id: c.anon_id,
      specialization: c.specialization,
      grade: c.grade,
      test_score: c.test_score,
      test_date: c.test_date,
      stacks: c.stacks,
      experience_years: c.experience_years,
      soft_skills: c.soft_skills,
      about: c.about,
      fsp: c.fsp,
    },
  });
}));

export default router;