import { query } from '../../db.js';

// Случайные N заданий из пула по специализации и грейду.
export const pickQuestions = async (specializationId, gradeId, limit = 5) => {
  const { rows } = await query(
    `SELECT id, topic, difficulty, kind, prompt, options
       FROM test.questions
      WHERE active = true
        AND specialization_id = $1
        AND grade_id = $2
      ORDER BY random()
      LIMIT $3`,
    [specializationId, gradeId, limit]
  );
  return rows;
};

export const getFullQuestion = async (id) => {
  const { rows } = await query(
    `SELECT id, kind, options, correct, rubric, difficulty
       FROM test.questions WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const createAttempt = async ({ userId, specializationId, targetGradeId, questionIds }) => {
  const { rows } = await query(
    `INSERT INTO test.attempts
       (user_id, specialization_id, target_grade_id, question_ids)
     VALUES ($1,$2,$3,$4)
     RETURNING id, started_at`,
    [userId, specializationId, targetGradeId, JSON.stringify(questionIds)]
  );
  return rows[0];
};

export const getAttempt = async (id) => {
  const { rows } = await query(`SELECT * FROM test.attempts WHERE id = $1`, [id]);
  return rows[0] || null;
};

export const saveAnswer = async ({ attemptId, questionId, payload, isCorrect, score }) => {
  const { rows } = await query(
    `INSERT INTO test.answers (attempt_id, question_id, payload, is_correct, score)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [attemptId, questionId, JSON.stringify(payload), isCorrect, score]
  );
  return rows[0];
};

export const listAnswers = async (attemptId) => {
  const { rows } = await query(
    `SELECT a.*, q.prompt, q.correct, q.options, q.kind, q.rubric
       FROM test.answers a
       JOIN test.questions q ON q.id = a.question_id
      WHERE a.attempt_id = $1`,
    [attemptId]
  );
  return rows;
};

export const finishAttempt = async ({ id, awardedGradeId, score, status }) => {
  const { rows } = await query(
    `UPDATE test.attempts
        SET awarded_grade_id = $2,
            score = $3,
            status = $4,
            finished_at = now()
      WHERE id = $1 RETURNING *`,
    [id, awardedGradeId, score, status]
  );
  return rows[0];
};

export const countAttemptsForGrade = async (userId, specId, gradeId, sinceDays = 90) => {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM test.attempts
      WHERE user_id = $1 AND specialization_id = $2 AND target_grade_id = $3
        AND started_at > now() - ($4 || ' days')::interval`,
    [userId, specId, gradeId, sinceDays]
  );
  return rows[0].n;
};