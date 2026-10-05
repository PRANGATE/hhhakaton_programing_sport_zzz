import { verifyAccessToken } from './auth.service.js';
import * as repo from './auth.repo.js';

export const requireAuth = async (req, res, next) => {
  try {
    const h = req.headers.authorization || '';
    const [scheme, token] = h.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const payload = verifyAccessToken(token);
    const user = await repo.findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  next();
};