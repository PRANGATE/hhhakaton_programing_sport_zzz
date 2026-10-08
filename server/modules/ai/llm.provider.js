// Резолвер активного LLM-провайдера. Кэширует результат на 30 секунд,
// чтобы не дёргать health на каждый запрос.
// Ни один доменный модуль не вызывает LLM напрямую — только через ai.service.

const CACHE_TTL_MS = 30_000;
let cache = { provider: undefined, at: 0 };

// Ленивая загрузка. Если модуля нет — он просто пропускается.
const LOADERS = {
  ollama: () => import('./llm.ollama.js'),
  mock:   () => import('./llm.mock.js'),
};

function candidates() {
  const raw = (process.env.LLM_PROVIDER || 'auto').toLowerCase();
  if (raw === 'auto') return ['ollama', 'yandex', 'giga', 'openai', 'mock'];
  return [raw];
}

export async function resolveProvider() {
  if (cache.provider !== undefined && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.provider;
  }

  for (const name of candidates()) {
    const loader = LOADERS[name];
    if (!loader) continue;
    try {
      const mod = await loader();
      const provider = mod.default;
      if (!provider) continue;
      const healthy = await Promise.resolve(provider.health()).catch(() => false);
      if (healthy) {
        cache = { provider, at: Date.now() };
        return provider;
      }
    } catch {
      // модуля нет / упал — пробуем следующий
    }
  }

  cache = { provider: null, at: Date.now() };
  return null;
}

export function resetProviderCache() {
  cache = { provider: undefined, at: 0 };
}