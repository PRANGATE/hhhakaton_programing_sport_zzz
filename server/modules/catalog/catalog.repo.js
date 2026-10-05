import { query } from '../../db.js';

export const listSpecializations = async () => {
  const { rows } = await query(
    `SELECT id, name, description
       FROM catalog.specializations
      ORDER BY sort_order, name`
  );
  return rows;
};

export const listGrades = async () => {
  const { rows } = await query(
    `SELECT id, name, level
       FROM catalog.grades
      ORDER BY level`
  );
  return rows;
};

// Если передан specialization_id — возвращаем общие + относящиеся к нему.
export const listStacks = async ({ specializationId } = {}) => {
  const { rows } = await query(
    `SELECT id, name, category, specialization_id
       FROM catalog.stacks
      WHERE $1::text IS NULL
         OR specialization_id IS NULL
         OR specialization_id = $1
      ORDER BY category, sort_order, name`,
    [specializationId || null]
  );
  return rows;
};