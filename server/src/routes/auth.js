import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { registerUser, loginUser, logoutSession, audit } from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { config } from '../config.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: config.loginWindowMs,
  max: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts', code: 'RATE_LIMIT' },
});

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { username, password, email, displayName } = req.body || {};
    const user = await registerUser({ username, password, email, displayName });
    audit(user.id, 'user.register', 'user', user.id, { username: user.username }, req);
    res.status(201).json({ user });
  })
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required', code: 'VALIDATION' });
    }
    const result = await loginUser({
      username,
      password,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    audit(result.user.id, 'user.login', 'user', result.user.id, null, req);

    res.cookie(config.sessionCookieName, result.token, {
      httpOnly: true,
      secure: !config.isDev,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token: result.token,
      user: result.user,
      expiresAt: result.expiresAt,
    });
  })
);

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    logoutSession(req.token);
    audit(req.user.id, 'user.logout', 'user', req.user.id, null, req);
    res.clearCookie(config.sessionCookieName);
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    res.json({
      authenticated: Boolean(req.user),
      user: req.user || null,
      aiEnabled: config.aiEnabled,
      version: config.version,
    });
  })
);

export default router;
