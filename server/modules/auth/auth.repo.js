import { query } from '../../db.js';

export const findUserByEmail = async (email) => {
  const { rows } = await query(
    `SELECT id, email, password_hash, role, email_verified_at, created_at
       FROM auth.users WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
};

export const findUserById = async (id) => {
  const { rows } = await query(
    `SELECT id, email, role, email_verified_at, created_at
       FROM auth.users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const insertUser = async ({ email, passwordHash, role }) => {
  const { rows } = await query(
    `INSERT INTO auth.users (email, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING id, email, role, email_verified_at, created_at`,
    [email, passwordHash, role]
  );
  return rows[0];
};

export const insertConsent = async ({ userId, kind, version, ip }) => {
  await query(
    `INSERT INTO auth.consents (user_id, kind, version, ip)
     VALUES ($1, $2, $3, $4)`,
    [userId, kind, version, ip]
  );
};

export const insertSession = async ({ userId, refreshHash, userAgent, ip, expiresAt }) => {
  const { rows } = await query(
    `INSERT INTO auth.sessions (user_id, refresh_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, refreshHash, userAgent, ip, expiresAt]
  );
  return rows[0];
};

export const findSessionByHash = async (refreshHash) => {
  const { rows } = await query(
    `SELECT id, user_id, expires_at, revoked_at
       FROM auth.sessions WHERE refresh_hash = $1`,
    [refreshHash]
  );
  return rows[0] || null;
};

export const revokeSession = async (id) => {
  await query(
    `UPDATE auth.sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [id]
  );
};