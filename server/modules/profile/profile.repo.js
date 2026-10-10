import { query } from '../../db.js';

export const getCandidate = async (userId) => {
  const { rows } = await query(
    `SELECT c.*, u.email
       FROM profile.candidates c
       JOIN auth.users u ON u.id = c.user_id
      WHERE c.user_id = $1`,
    [userId]
  );
  if (rows[0]) return rows[0];

  // строки профиля ещё нет — отдаём минимум, чтобы UI не падал
  const { rows: urows } = await query(
    `SELECT id, email, role FROM auth.users WHERE id = $1`,
    [userId]
  );
  if (!urows[0]) return null;

  return {
    user_id:          urows[0].id,
    email:            urows[0].email,
    full_name:        null,
    telegram:         null,
    phone:            null,
    about:            null,
    experience_years: null,
    roles:            [],
    stacks:           [],
    soft_skills:      [],
    visibility:       {},
  };
};

// Колонки jsonb — их надо сериализовать вручную.
const JSONB_FIELDS = new Set(['stacks', 'soft_skills', 'visibility', 'roles']);

const toPg = (col, val) =>
  JSONB_FIELDS.has(col) && val != null ? JSON.stringify(val) : val;

export const upsertCandidate = async (userId, patch) => {
  const cols = Object.keys(patch);
  if (!cols.length) return getCandidate(userId);

  const insert = ['user_id', ...cols];
  const params = [userId, ...cols.map(c => toPg(c, patch[c]))];
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

export const upsertEmployer = async (userId, patch) => {
  const cols = Object.keys(patch);
  // Guard: пустой patch = нечего писать. company_name required,
  // но подстрахуемся, чтобы SQL не собрался с "SET , updated_at".
  if (!cols.length) return getEmployer(userId);

  const insert = ['user_id', ...cols];
  const params = [userId, ...cols.map(c => toPg(c, patch[c]))];
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

export const getEmployer = async (userId) => {
  const { rows } = await query(
    `SELECT * FROM profile.employers WHERE user_id = $1`, [userId]
  );
  return rows[0] || null;
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