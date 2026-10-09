import { query } from '../../db.js';

export const listCandidates = async () => {
  const { rows } = await query(
    `SELECT u.id, u.email, u.created_at,
            c.full_name, c.specialization_id, c.current_grade_id
       FROM auth.users u
       LEFT JOIN profile.candidates c ON c.user_id = u.id
      WHERE u.role = 'candidate'
      ORDER BY u.created_at DESC`
  );
  return rows;
};

export const listEmployers = async () => {
  const { rows } = await query(
    `SELECT u.id, u.email, u.created_at,
            e.company_name
       FROM auth.users u
       LEFT JOIN profile.employers e ON e.user_id = u.id
      WHERE u.role = 'employer'
      ORDER BY u.created_at DESC`
  );
  return rows;
};

// Удаляем пользователя целиком — FK ON DELETE CASCADE
// подчистит профиль, сессии, приглашения, попытки теста и т.д.
export const deleteUser = async (userId, role) => {
  const { rowCount } = await query(
    `DELETE FROM auth.users WHERE id = $1 AND role = $2`,
    [userId, role]
  );
  return rowCount > 0;
};