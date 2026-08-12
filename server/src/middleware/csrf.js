/**
 * Lightweight double-submit CSRF for cookie-authenticated mutating requests.
 * Bearer-token requests are exempt (SPA using Authorization header).
 */
import { randomBytes } from 'crypto';
import { config } from '../config.js';

export function ensureCsrfCookie(req, res, next) {
  const name = config.csrfCookieName;
  if (!req.cookies?.[name]) {
    const token = randomBytes(24).toString('hex');
    res.cookie(name, token, {
      httpOnly: false, // readable by JS for double-submit
      sameSite: 'lax',
      secure: !config.isDev,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
  next();
}

export function requireCsrf(req, res, next) {
  // Only enforce for cookie-based sessions on mutating methods
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();

  const hasBearer = (req.headers.authorization || '').startsWith('Bearer ');
  if (hasBearer) return next(); // SPA using Authorization header

  const cookieToken = req.cookies?.[config.csrfCookieName];
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF token missing or invalid', code: 'CSRF_FAILED' });
  }
  next();
}
