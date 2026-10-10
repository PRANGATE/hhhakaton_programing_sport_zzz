// server/modules/matching/matching.repo.js
//
// Выборка кандидатов из реальной БД. Мок-банк удалён.
//
// Категория кандидата определяется:
//   • специализацией + грейдом из последней УСПЕШНОЙ попытки теста
//     (test.attempts.awarded_grade_id / target_grade_id);
//   • если успешных попыток нет — берём то, что указано в профиле
//     (profile.candidates.target_grade_id / current_grade_id).
//
// test_score — score последней успешной попытки; если успешных нет —
// score последней вообще (для отображения в карточке).

import { query } from '../../db.js';

// Детерминированный анонимный ID: K-XXXX из uuid.
// Одинаков для одного кандидата между запросами.
const anonId = (uuid) => {
  const hex = String(uuid).replace(/-/g, '').slice(0, 6).toUpperCase();
  return 'K-' + hex;
};

const mapRow = (row) => {
  const stacks = Array.isArray(row.stacks)
    ? row.stacks
        .map((s) => (typeof s === 'string' ? s : s?.name))
        .filter(Boolean)
    : [];

  const softSkills = Array.isArray(row.soft_skills) ? row.soft_skills : [];

  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    specialization: row.specialization || 'unknown',
    grade: row.grade || 'unknown',
    test_score: row.test_score != null ? Number(row.test_score) : 0,
    test_date: row.test_date,
    stacks,
    experience_years:
      row.experience_years != null ? Number(row.experience_years) : 0,
    soft_skills: softSkills,
    about: row.about,
    // fsp.achievements в текущих миграциях нет — отдаём пустой массив.
    // После добавления миграции fsp.achievements — заполнить здесь.
    fsp: [],
  };
};

// Один и тот же SELECT-подзапрос для списка и для карточки.
// Параметры: [userId | null] — если null, берём всех.
const BASE_SQL = `
  WITH latest_pass AS (
    SELECT DISTINCT ON (user_id)
           user_id,
           awarded_grade_id,
           target_grade_id,
           specialization_id,
           score,
           finished_at
      FROM test.attempts
     WHERE status = 'passed'
       AND ($1::uuid IS NULL OR user_id = $1)
     ORDER BY user_id, finished_at DESC NULLS LAST
  ),
  latest_any AS (
    SELECT DISTINCT ON (user_id)
           user_id,
           score,
           status,
           started_at
      FROM test.attempts
     WHERE ($1::uuid IS NULL OR user_id = $1)
     ORDER BY user_id, started_at DESC
  )
  SELECT u.id,
         u.email,
         c.full_name,
         c.specialization_id,
         c.target_grade_id,
         c.current_grade_id,
         c.stacks,
         c.experience_years,
         c.soft_skills,
         c.about,
         COALESCE(lp.awarded_grade_id,
                  lp.target_grade_id,
                  c.current_grade_id,
                  c.target_grade_id)                     AS grade,
         COALESCE(lp.specialization_id,
                  c.specialization_id)                   AS specialization,
         COALESCE(lp.score, la.score)                    AS test_score,
         COALESCE(lp.finished_at, la.started_at)         AS test_date
    FROM auth.users u
    JOIN profile.candidates c ON c.user_id = u.id
    LEFT JOIN latest_pass lp  ON lp.user_id = u.id
    LEFT JOIN latest_any  la  ON la.user_id = u.id
   WHERE u.role = 'candidate'
     AND ($1::uuid IS NULL OR u.id = $1)
   ORDER BY u.created_at DESC
`;

export const listCandidates = async () => {
  const { rows } = await query(BASE_SQL, [null]);
  return rows.map(mapRow);
};

export const getCandidateById = async (id) => {
  const { rows } = await query(BASE_SQL, [id]);
  if (!rows[0]) return null;
  return mapRow(rows[0]);
};

export { anonId };