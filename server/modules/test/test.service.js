import * as repo from './test.repo.js';
import * as ai from '../ai/ai.service.js';

const PASS_THRESHOLD = 60;
const LOWER_GRADE  = { senior: 'middle', middle: 'junior', junior: null };

const llmMode = () => process.env.LLM_MODE || 'hybrid'; // hybrid | generate | pool

const fail = (code, message) => {
  const e = new Error(message || code);
  e.code = code;
  return e;
};

const scoreAnswer = (question, payload) => {
  if (question.kind === 'single') {
    return Number(payload?.choice) === Number(question.correct) ? 100 : 0;
  }
  if (question.kind === 'multi') {
    const chosen  = new Set((payload?.choices || []).map(Number));
    const correct = new Set((question.correct || []).map(Number));
    if (chosen.size !== correct.size) return 0;
    for (const c of chosen) if (!correct.has(c)) return 0;
    return 100;
  }
  // свободный текст: оценивает LLM, если доступен
  return payload?.text && payload.text.trim().length > 20 ? 50 : 0;
};

const toPublic = ({ id, topic, difficulty, kind, prompt, options }) =>
  ({ id, topic, difficulty, kind, prompt, options });

export const startAttempt = async ({ userId, specializationId, targetGradeId }) => {
  // 1. Лимит смены грейда (не чаще раза в 90 дней)
  const recent = await repo.countAttemptsForGrade(userId, specializationId, targetGradeId, 90);
  if (recent > 0) throw fail('GRADE_CHANGE_LOCKED');

  const mode = llmMode();
  let questions = [];
  let source = 'none';

  // 2. LLM (если режим не pool)
  if (mode !== 'pool') {
    try {
      questions = await ai.generateQuestions({
        specializationId, targetGradeId, count: 5, userId,
      });
      source = 'llm';
    } catch (err) {
      if (mode === 'generate') throw fail('LLM_UNAVAILABLE');
      console.warn('[test] LLM generation failed, falling back to pool:', err.message);
    }
  }

  // 3. Fallback: пул из БД
  if (questions.length < 3) {
    const pool = await repo.pickQuestions(specializationId, targetGradeId, 5);
    if (pool.length >= 3) {
      questions = pool.map(q => ({ ...q, generatedByLlm: false }));
      source = 'pool';
    }
  }

  // 4. Ни LLM, ни пул не дали минимум — 503
  if (questions.length < 3) {
    throw fail('LLM_UNAVAILABLE');
  }

  // 5. Персистим сгенерированные, чтобы FK answers→questions сработал
  if (source === 'llm') {
    try {
      const persisted = await repo.persistGeneratedQuestions({
        specializationId, targetGradeId, questions,
      });
      if (persisted.length >= 3) questions = persisted.map(q => ({ ...q, generatedByLlm: true }));
    } catch (err) {
      console.warn('[test] persist generated questions failed:', err.message);
      // если не смогли персистить — уходим в пул
      const pool = await repo.pickQuestions(specializationId, targetGradeId, 5);
      if (pool.length >= 3) {
        questions = pool.map(q => ({ ...q, generatedByLlm: false }));
        source = 'pool';
      } else {
        throw fail('LLM_UNAVAILABLE');
      }
    }
  }

  const attempt = await repo.createAttempt({
    userId, specializationId, targetGradeId,
    questionIds: questions.map(q => q.id),
  });

  return {
    attempt,
    source,                                 // 'llm' | 'pool' — покажем на фронте для демо
    questions: questions.map(toPublic),
  };
};

export const submitAnswer = async ({ attemptId, userId, questionId, payload }) => {
  const attempt = await repo.getAttempt(attemptId);
  if (!attempt || attempt.user_id !== userId) throw fail('NOT_FOUND');
  if (attempt.status !== 'in_progress')      throw fail('ATTEMPT_CLOSED');

  const q = await repo.getFullQuestion(questionId);
  if (!q) throw fail('NOT_FOUND');

  const score = scoreAnswer(q, payload);
  await repo.saveAnswer({ attemptId, questionId, payload, isCorrect: score === 100, score });
  return { ok: true };
};

export const finishAttempt = async ({ attemptId, userId }) => {
  const attempt = await repo.getAttempt(attemptId);
  if (!attempt || attempt.user_id !== userId) throw fail('NOT_FOUND');

  if (attempt.status !== 'in_progress') {
    return { attempt, breakdown: await repo.listAnswers(attemptId) };
  }

  const answers = await repo.listAnswers(attemptId);
  const total   = answers.reduce((s, a) => s + (a.score || 0), 0);
  const score   = answers.length ? Math.round(total / answers.length) : 0;

  const passed = score >= PASS_THRESHOLD;
  const finished = await repo.finishAttempt({
    id: attemptId,
    awardedGradeId: passed ? attempt.target_grade_id : null,
    score,
    status: passed ? 'passed' : 'failed',
  });

  return {
    attempt: finished,
    score,
    passed,
    awarded_grade_id: passed ? attempt.target_grade_id : null,
    suggested_lower:  !passed ? LOWER_GRADE[attempt.target_grade_id] : null,
    breakdown: answers.map(a => ({
      question_id: a.question_id,
      prompt:      a.prompt,
      kind:        a.kind,
      options:     a.options,
      correct:     a.correct,
      payload:     a.payload,
      is_correct:  a.is_correct,
      score:       a.score,
    })),
  };
};