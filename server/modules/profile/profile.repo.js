import { query } from '../../db.js';

export const getCandidate = async (userId) => {
  const { rows } = await query(
    `SELECT * FROM profile.candidates WHERE user_id = $1`, [userId]
  );
  return rows[0] || null;
};

export const upsertCandidate = async (userId, patch) => {
  const cols = Object.keys(patch);
  if (!cols.length) return getCandidate(userId);

  const insert = ['user_id', ...cols];
  const params = [userId, ...cols.map(c => patch[c])];
  const placeholders = insert.map((_, i) => `$${i + 1}`);

  const updates = cols.map(c => `${c} = EXCLUDED.${c}`).join(', ');

  const { rows } = await query(
    `INSERT INTO profile.candidates (${insert.join(',')})
     VALUES (${placeholders.join(',')})
     ON CONFLICT (user_id) DO UPDATE
       SET ${updates}, updated_at = now()
     RETURNING *`,
    params
  );
  return rows[0];
};

export const getEmployer = async (userId) => {
  const { rows } = await query(
    `SELECT * FROM profile.employers WHERE user_id = $1`, [userId]
  );
  return rows[0] || null;
};

export const upsertEmployer = async (userId, patch) => {
  const cols = Object.keys(patch);
  const insert = ['user_id', ...cols];
  const params = [userId, ...cols.map(c => patch[c])];
  const placeholders = insert.map((_, i) => `$${i + 1}`);
  const updates = cols.map(c => `${c} = EXCLUDED.${c}`).join(', ');

  const { rows } = await query(
    `INSERT INTO profile.employers (${insert.join(',')})
     VALUES (${placeholders.join(',')})
     ON CONFLICT (user_id) DO UPDATE
       SET ${updates}, updated_at = now()
     RETURNING *`,
    params
  );
  return rows[0];
};

export const insertGradeHistory = async ({ userId, gradeId }) => {
  await query(
    `INSERT INTO profile.grade_history (user_id, grade_id) VALUES ($1, $2)`,
    [userId, gradeId]
  );
};

export const lastGradeChange = async (userId) => {
  const { rows } = await query(
    `SELECT grade_id, changed_at FROM profile.grade_history
      WHERE user_id = $1 ORDER BY changed_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
};