const URL     = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL   = process.env.LLM_MODEL  || 'llama3.1:8b';
const TIMEOUT = Number(process.env.LLM_TIMEOUT_MS || 5000);

export default {
  name: 'ollama',

  async health() {
    try {
      const r = await fetch(`${URL}/api/tags`, { signal: AbortSignal.timeout(TIMEOUT) });
      return r.ok;
    } catch {
      return false;
    }
  },

  // Реализацию generateQuestions/evaluateAnswer добавим на этапе 3.
  async generateQuestions() {
    throw new Error('ollama: generate not implemented yet');
  },
  async evaluateAnswer() {
    throw new Error('ollama: evaluate not implemented yet');
  },
};