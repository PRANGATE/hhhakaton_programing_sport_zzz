import { Router } from 'express';
import * as repo from './catalog.repo.js';

const router = Router();

router.get('/specializations', async (_req, res, next) => {
  try {
    res.json({ items: await repo.listSpecializations() });
  } catch (err) { next(err); }
});

router.get('/grades', async (_req, res, next) => {
  try {
    res.json({ items: await repo.listGrades() });
  } catch (err) { next(err); }
});

router.get('/stacks', async (req, res, next) => {
  try {
    res.json({
      items: await repo.listStacks({ specializationId: req.query.specialization }),
    });
  } catch (err) { next(err); }
});

export default router;