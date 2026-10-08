import { resolveProvider } from './llm.provider.js';

export async function generateQuestions({ specializationId, targetGradeId, count = 5, userId }) {
  const provider = await resolveProvider();
  if (!provider) {
    const err = new Error('llm_unavailable');
    err.code = 'LLM_UNAVAILABLE';
    throw err;
  }
  const questions = await provider.generateQuestions({
    specializationId, targetGradeId, count, userId,
  });
  return questions.map(q => ({
    ...q,
    generatedByLlm: true,
    model: provider.name,
  }));
}

export async function evaluateAnswer({ question, payload }) {
  const provider = await resolveProvider();
  if (!provider) {
    const err = new Error('llm_unavailable');
    err.code = 'LLM_UNAVAILABLE';
    throw err;
  }
  return provider.evaluateAnswer({ question, payload });
}

export async function isAvailable() {
  const provider = await resolveProvider();
  return {
    ok:       !!provider,
    provider: provider?.name || null,
    mode:     process.env.LLM_MODE || 'hybrid',
  };
}