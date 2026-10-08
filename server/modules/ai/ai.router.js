import { Router } from 'express';
import { isAvailable } from './ai.service.js';

const router = Router();

// Публичный health LLM-слоя. Фронт и мониторинг могут дёргать.
router.get('/health', async (_req, res) => {
  const h = await isAvailable();
  res.status(h.ok ? 200 : 503).json({
    ...h,
    checkedAt: new Date().toISOString(),
  });
});

export default router;