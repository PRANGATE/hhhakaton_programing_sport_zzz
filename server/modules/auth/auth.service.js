import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import * as repo from './auth.repo.js';

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TTL     = process.env.JWT_ACCESS_TTL  || '15m';
const REFRESH_TTL    = process.env.JWT_REFRESH_TTL || '30d';
const CONSENT_VERSION = 'v1';

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set');
}

// --- пароли ---
export const hashPassword = (plain) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// --- токены ---
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const signAccess = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });

const signRefresh = (user, sessionId) =>
  jwt.sign({ sub: user.id, sid: sessionId }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });

const ttlToMs = (ttl) => {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) throw new Error(`bad ttl: ${ttl}`);
  const n = +m[1];
  return n * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]]);
};

// --- регистрация ---
export const register = async ({ email, password, role, ip, userAgent }) => {
  const exists = await repo.findUserByEmail(email);
  if (exists) {
    const err = new Error('email_taken');
    err.code = 'EMAIL_TAKEN';
    throw err;
  }

  const passwordHash = await hashPassword(password);
  const user = await repo.insertUser({ email, passwordHash, role });

  // 152-ФЗ: фиксируем согласие на обработку
  await repo.insertConsent({ userId: user.id, kind: 'processing', version: CONSENT_VERSION, ip });

  return issueTokens({ user, ip, userAgent });
};

// --- логин ---
export const login = async ({ email, password, ip, userAgent }) => {
  const user = await repo.findUserByEmail(email);
  if (!user) {
    const err = new Error('invalid_credentials');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    const err = new Error('invalid_credentials');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }
  return issueTokens({
    user: { id: user.id, email: user.email, role: user.role, email_verified_at: user.email_verified_at },
    ip, userAgent,
  });
};

// --- выдача пары токенов ---
const issueTokens = async ({ user, ip, userAgent }) => {
  const expiresAt = new Date(Date.now() + ttlToMs(REFRESH_TTL));

  // Черновой refresh: сначала кладём в БД, потом подписываем JWT с sid сессии.
  // Так проще: одна запись = одна активная сессия.
  const session = await repo.insertSession({
    userId: user.id,
    refreshHash: 'placeholder_' + crypto.randomUUID(),
    userAgent: userAgent || null,
    ip: ip || null,
    expiresAt,
  });

  const refreshToken = signRefresh(user, session.id);
  const refreshHash = sha256(refreshToken);

  // Перезаписываем refresh_hash реальным значением
  await repo.revokeSession(session.id);
  await repo.insertSession({
    userId: user.id,
    refreshHash,
    userAgent: userAgent || null,
    ip: ip || null,
    expiresAt,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      email_verified_at: user.email_verified_at || null,
    },
    accessToken: signAccess(user),
    refreshToken,
    expiresIn: Math.floor(ttlToMs(ACCESS_TTL) / 1000),
  };
};

// --- refresh ---
export const refresh = async ({ refreshToken, ip, userAgent }) => {
  let payload;
  try {
    payload = jwt.verify(refreshToken, REFRESH_SECRET);
  } catch {
    const err = new Error('invalid_refresh');
    err.code = 'INVALID_REFRESH';
    throw err;
  }

  const hash = sha256(refreshToken);
  const session = await repo.findSessionByHash(hash);
  if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) {
    const err = new Error('invalid_refresh');
    err.code = 'INVALID_REFRESH';
    throw err;
  }

  // Ротация: старую сессию отзываем, создаём новую
  await repo.revokeSession(session.id);

  const user = await repo.findUserById(payload.sub);
  if (!user) {
    const err = new Error('invalid_refresh');
    err.code = 'INVALID_REFRESH';
    throw err;
  }

  return issueTokens({ user, ip, userAgent });
};

// --- logout ---
export const logout = async (refreshToken) => {
  if (!refreshToken) return;
  const hash = sha256(refreshToken);
  const session = await repo.findSessionByHash(hash);
  if (session) await repo.revokeSession(session.id);
};

// --- verify access ---
export const verifyAccessToken = (token) => jwt.verify(token, ACCESS_SECRET);

// ПРОТОТИП: реальную почту не шлём — принимаем любой 6-значный код.
// В проде: сгенерировать код, сохранить хеш в auth.email_codes (TTL 10 мин)
// и сравнить. Сейчас интерфейс совпадает, чтобы потом подменить.
export const verifyEmail = async ({ email, code, ip, userAgent }) => {
  if (!/^\d{6}$/.test(String(code || ''))) {
    const err = new Error('invalid_code');
    err.code = 'INVALID_CODE';
    throw err;
  }
  const user = await repo.findUserByEmail(email);
  if (!user) {
    const err = new Error('not_found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!user.email_verified_at) await repo.markEmailVerified(user.id);

  return issueTokens({
    user: {
      id: user.id, email: user.email, role: user.role,
      email_verified_at: new Date().toISOString(),
    },
    ip, userAgent,
  });
};