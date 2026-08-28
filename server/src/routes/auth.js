import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { registerUser, loginUser, logoutSession, audit } from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { hashToken } from '../utils/id.js';
import { issueWsTicket } from '../services/tickets.service.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: config.loginWindowMs, max: config.authRateLimitMax,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many authentication attempts', code: 'RATE_LIMIT' },
});

function cookieOptions() {
  return { httpOnly: true, secure: !config.isDev, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' };
}

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const { username, password, email, displayName } = req.body || {};
  const user = await registerUser({ username, password, email, displayName });
  audit(user.id, 'user.register', 'user', user.id, { username: user.username }, req);
  res.status(201).json({ user });
}));

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required', code: 'VALIDATION' });
  const result = await loginUser({ username, password, userAgent: req.headers['user-agent'], ip: req.ip });
  audit(result.user.id, 'user.login', 'user', result.user.id, null, req);
  res.cookie(config.sessionCookieName, result.token, cookieOptions());
  res.json({ token: result.token, user: result.user, expiresAt: result.expiresAt });
}));

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  logoutSession(req.token);
  audit(req.user.id, 'user.logout', 'user', req.user.id, null, req);
  res.clearCookie(config.sessionCookieName, { httpOnly: true, secure: !config.isDev, sameSite: 'lax', path: '/' });
  res.json({ ok: true });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: req.user });
}));

router.get('/sessions', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT id, user_agent, ip, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > datetime('now') ORDER BY last_seen_at DESC`).all(req.user.id);
  const currentHash = hashToken(req.token);
  const currentIds = new Set(db.prepare('SELECT id FROM sessions WHERE token_hash = ?').all(currentHash).map((r) => r.id));
  res.json({
    sessions: rows.map((r) => ({
      id: r.id, userAgent: r.user_agent, ip: r.ip, createdAt: r.created_at,
      lastSeenAt: r.last_seen_at, expiresAt: r.expires_at, current: currentIds.has(r.id),
    })),
  });
}));

router.post('/ws-ticket', requireAuth, asyncHandler(async (req, res) => {
  res.json(issueWsTicket(req.user.id));
}));

router.delete('/sessions/:id', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const sessionId = req.params.id;
  if (sessionId === 'others') {
    const hash = hashToken(req.token);
    const result = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user.id, hash);
    audit(req.user.id, 'session.revoke_others', 'session', null, { count: result.changes }, req);
    return res.json({ ok: true, revoked: result.changes });
  }
  const row = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
  if (!row) return res.status(404).json({ error: 'Session not found' });
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  audit(req.user.id, 'session.revoke', 'session', sessionId, null, req);
  res.json({ ok: true });
}));

export default router;
