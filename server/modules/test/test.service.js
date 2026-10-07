import * as repo from './test.repo.js';

const PASS_THRESHOLD = 60;          // проходной балл
const LOWER_GRADE = { senior: 'middle', middle: 'junior', junior: null };
const HIGHER_GRADE = { junior: 'middle', middle: 'senior', senior: null };

const scoreAnswer = (question, payload) => {
  if (question.kind === 'single') {
    return Number(payload?.choice) === Number(question.correct) ? 100 : 0;
  }
  if (question.kind === 'multi') {
    const chosen = new Set((payload?.choices || []).map(Number));
    const correct = new Set((question.correct || []).map(Number));
    if (chosen.size !== correct.size) return 0;
    for (const c of chosen) if (!correct.has(c)) return 0;
    return 100;
  }
  // свободный текст: MVP — заглушка, 50 по умолчанию (позже подключаем LLM)
  return payload?.text && payload.text.trim().length > 20 ? 50 : 0;
};

// Начать попытку. Проверяет лимит смены грейда.
export const startAttempt = async ({ userId, specializationId, targetGradeId }) => {
  const recent = await repo.countAttemptsForGrade(userId, specializationId, targetGradeId, 90);
  if (recent > 0) {
    const err = new Error('grade_change_locked');
    err.code = 'GRADE_CHANGE_LOCKED';
    throw err;
  }

  const questions = await repo.pickQuestions(specializationId, targetGradeId, 5);
  if (questions.length < 3) {
    const err = new Error('not_enough_questions');
    err.code = 'NOT_ENOUGH_QUESTIONS';
    throw err;
  }

  const attempt = await repo.createAttempt({
    userId, specializationId, targetGradeId,
    questionIds: questions.map(q => q.id),
  });

  return { attempt, questions: questions.map(({ id, topic, difficulty, kind, prompt, options }) =>
    ({ id, topic, difficulty, kind, prompt, options })) };
};

export const submitAnswer = async ({ attemptId, userId, questionId, payload }) => {
  const attempt = await repo.getAttempt(attemptId);
  if (!attempt || attempt.user_id !== userId) {
    const err = new Error('not_found'); err.code = 'NOT_FOUND'; throw err;
  }
  if (attempt.status !== 'in_progress') {
    const err = new Error('attempt_closed'); err.code = 'ATTEMPT_CLOSED'; throw err;
  }
  const q = await repo.getFullQuestion(questionId);
  if (!q) { const err = new Error('not_found'); err.code = 'NOT_FOUND'; throw err; }

  const score = scoreAnswer(q, payload);
  await repo.saveAnswer({
    attemptId, questionId, payload,
    isCorrect: score === 100,
    score,
  });
  return { ok: true };
};

export const finishAttempt = async ({ attemptId, userId }) => {
  const attempt = await repo.getAttempt(attemptId);
  if (!attempt || attempt.user_id !== userId) {
    const err = new Error('not_found'); err.code = 'NOT_FOUND'; throw err;
  }
  if (attempt.status !== 'in_progress') {
    return { attempt, breakdown: await repo.listAnswers(attemptId) };
  }

  const answers = await repo.listAnswers(attemptId);
  const total = answers.reduce((s, a) => s + (a.score || 0), 0);
  const score = answers.length ? Math.round(total / answers.length) : 0;

  const passed = score >= PASS_THRESHOLD;
  const awardedGrade = passed
    ? attempt.target_grade_id
    : LOWER_GRADE[attempt.target_grade_id];  // не понижаем принудительно, только предлагаем

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
    awarded_grade_id: awardedGrade,
    suggested_lower: !passed ? LOWER_GRADE[attempt.target_grade_id] : null,
    breakdown: answers.map(a => ({
      question_id: a.question_id,
      prompt: a.prompt,
      kind: a.kind,
      options: a.options,
      correct: a.correct,
      payload: a.payload,
      is_correct: a.is_correct,
      score: a.score,
    })),
  };
};