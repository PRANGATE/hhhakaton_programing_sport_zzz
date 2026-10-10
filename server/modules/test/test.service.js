import * as repo from './test.repo.js';
import * as ai from '../ai/ai.service.js';

const PASS_THRESHOLD = 60;
const LOWER_GRADE  = { senior: 'middle', middle: 'junior', junior: null };
const COOLDOWN_DAYS = 90;   // окно, в течение которого повторная попытка на тот же грейд заблокирована

const llmMode = () => process.env.LLM_MODE || 'hybrid';

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
  return payload?.text && payload.text.trim().length > 20 ? 50 : 0;
};

const toPublic = ({ id, topic, difficulty, kind, prompt, options }) =>
  ({ id, topic, difficulty, kind, prompt, options });

export const startAttempt = async ({ userId, specializationId, targetGradeId }) => {
  const recent = await repo.countAttemptsForGrade(userId, specializationId, targetGradeId, COOLDOWN_DAYS);
  if (recent > 0) throw fail('GRADE_CHANGE_LOCKED');

  const mode = llmMode();
  let questions = [];
  let source = 'none';

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

  const TARGET = 5;
  if (questions.length < TARGET) {
    const need = TARGET - questions.length;
    const pool = await repo.pickQuestions(specializationId, targetGradeId, need);
    if (pool.length) {
      const fromPool = pool.map(q => ({ ...q, generatedByLlm: false }));
      questions = questions.concat(fromPool);
      source = questions.some(q => q.generatedByLlm) ? 'mixed' : 'pool';
    }
  }

  if (questions.length < 3) throw fail('LLM_UNAVAILABLE');

  const llmOnly = questions.filter(q => q.generatedByLlm && !q.id);
  if (llmOnly.length) {
    try {
      const persisted = await repo.persistGeneratedQuestions({
        specializationId, targetGradeId, questions: llmOnly,
      });
      let k = 0;
      questions = questions.map(q =>
        (q.generatedByLlm && !q.id)
          ? { ...q, ...persisted[k++], generatedByLlm: true }
          : q
      );
    } catch (err) {
      console.warn('[test] persist LLM questions failed:', err.message);
      questions = questions.filter(q => !q.generatedByLlm || q.id);
      source = 'pool';
    }
  }

  if (questions.length < 3) throw fail('LLM_UNAVAILABLE');

  const attempt = await repo.createAttempt({
    userId, specializationId, targetGradeId,
    questionIds: questions.map(q => q.id),
  });

  return { attempt, source, questions: questions.map(toPublic) };
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

/* ============================================================
   История тестов — для экрана профиля.
   ============================================================
   Отдаём:
     • items   — список попыток (свежие вверху),
     • current — текущая подтверждённая категория (последняя успешная),
     • locks   — до какой даты заблокирована попытка на каждый (spec, grade).
*/

export const getHistory = async ({ userId }) => {
  const rows = await repo.listAttemptsForUser(userId, 50);

  const items = rows.map(r => ({
    id: r.id,
    specialization_id: r.specialization_id,
    target_grade_id: r.target_grade_id,
    awarded_grade_id: r.awarded_grade_id,
    score: r.score,
    status: r.status,
    started_at: r.started_at,
    finished_at: r.finished_at,
  }));

  // Текущая категория = последняя успешная попытка.
  const lastPassed = items.find(a => a.status === 'passed' && a.awarded_grade_id);
  const current = lastPassed
    ? {
        specialization_id: lastPassed.specialization_id,
        grade_id: lastPassed.awarded_grade_id,
        since: lastPassed.finished_at || lastPassed.started_at,
      }
    : null;

  // Для каждой пары (spec, target_grade) — самая свежая попытка.
  // Её started_at + COOLDOWN_DAYS = дата, до которой попытка заблокирована.
  const locks = {};
  const now = Date.now();
  const cooldownMs = COOLDOWN_DAYS * 86_400_000;

  for (const a of items) {
    const key = `${a.specialization_id}|${a.target_grade_id}`;
    if (locks[key]) continue; // items отсортированы DESC, первый — самый свежий

    const lastStarted = new Date(a.started_at).getTime();
    const until = lastStarted + cooldownMs;
    if (until > now) {
      locks[key] = { until: new Date(until).toISOString(), last_attempt_at: a.started_at };
    }
  }

  return { items, current, locks, cooldown_days: COOLDOWN_DAYS };
};