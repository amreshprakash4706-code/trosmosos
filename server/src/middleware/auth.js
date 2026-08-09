import { validateSession } from '../services/auth.service.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token =
    (header.startsWith('Bearer ') ? header.slice(7) : null) ||
    req.cookies?.[req.app.get('sessionCookieName')] ||
    null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }

  const user = validateSession(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired session', code: 'SESSION_INVALID' });
  }

  req.user = user;
  req.token = token;
  next();
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token =
    (header.startsWith('Bearer ') ? header.slice(7) : null) ||
    req.cookies?.[req.app.get('sessionCookieName')] ||
    null;

  if (token) {
    const user = validateSession(token);
    if (user) {
      req.user = user;
      req.token = token;
    }
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
  }
  next();
}
