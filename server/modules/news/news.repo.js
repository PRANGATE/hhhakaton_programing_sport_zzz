import { query } from '../../db.js';

export const listPosts = async ({ limit = 50 } = {}) => {
  const { rows } = await query(
    `SELECT p.id, p.title, p.body, p.published_at, p.created_at,
            u.email AS author_email
       FROM news.posts p
       LEFT JOIN auth.users u ON u.id = p.author_id
      ORDER BY p.published_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows;
};

export const insertPost = async ({ title, body, authorId }) => {
  const { rows } = await query(
    `INSERT INTO news.posts (title, body, author_id)
     VALUES ($1, $2, $3)
     RETURNING id, title, body, published_at, created_at, author_id`,
    [title, body, authorId]
  );
  return rows[0];
};

export const deletePost = async (id) => {
  const { rowCount } = await query(`DELETE FROM news.posts WHERE id = $1`, [id]);
  return rowCount > 0;
};