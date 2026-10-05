import pg from 'pg';

const { Pool } = pg;

// Пул соединений к PostgreSQL.
// max=10 — достаточно для одного app-инстанса при нагрузке до ~1000 польз.
// Если выйдем за пределы — ставим PgBouncer в transaction mode.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[fsp] pg pool error', err);
});

export const query = (text, params) => pool.query(text, params);
export default pool;