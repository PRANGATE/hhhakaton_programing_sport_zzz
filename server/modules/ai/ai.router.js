import { Router } from 'express';
import { isAvailable } from './ai.service.js';
import { resolveProvider } from './llm.provider.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const h = await isAvailable();
  res.status(h.ok ? 200 : 503).json({
    ...h,
    checkedAt: new Date().toISOString(),
  });
});

// Расширенный статус: проброс до Ollama-туннеля.
router.get('/status', async (_req, res) => {
  const provider = await resolveProvider();

  const out = {
    ok:        !!provider,
    provider:  provider?.name || null,
    mode:      process.env.LLM_MODE || 'hybrid',
    ollamaUrl: process.env.OLLAMA_URL || null,
    model:     process.env.LLM_MODEL  || null,
    checkedAt: new Date().toISOString(),
  };

  if (provider?.checkStatus) {
    out.details = await provider.checkStatus()
      .catch(e => ({ error: e.message }));
  }

  res.status(out.ok ? 200 : 503).json(out);
});

export default router;