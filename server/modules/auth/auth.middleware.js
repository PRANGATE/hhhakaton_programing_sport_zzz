import { verifyAccessToken } from './auth.service.js';
import * as repo from './auth.repo.js';

export const requireAuth = async (req, res, next) => {
  const h = req.headers.authorization || '';
  const [scheme, token] = h.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'unauthorized', reason: 'no_token' });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: 'unauthorized', reason: 'invalid_token' });
  }

  try {
    const user = await repo.findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'unauthorized', reason: 'user_not_found' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  next();
};