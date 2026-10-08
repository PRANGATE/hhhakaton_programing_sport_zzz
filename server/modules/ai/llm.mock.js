// Заглушка. health() всегда false — LLM_MODE=generate без реального
// провайдера должен корректно падать в LLM_UNAVAILABLE.
export default {
  name: 'mock',
  async health() { return false; },
  async generateQuestions() { throw new Error('mock: generate not implemented'); },
  async evaluateAnswer()   { throw new Error('mock: evaluate not implemented'); },
};