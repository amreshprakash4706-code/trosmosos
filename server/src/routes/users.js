import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { hashPassword } from '../services/auth.service.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

router.patch(
  '/profile',
  asyncHandler(async (req, res) => {
    const { displayName, email, avatarUrl } = req.body || {};
    const db = getDb();
    const fields = [];
    const values = [];
    if (displayName !== undefined) {
      fields.push('display_name = ?');
      values.push(String(displayName).slice(0, 64));
    }
    if (email !== undefined) {
      fields.push('email = ?');
      values.push(email ? String(email).trim().toLowerCase() : null);
    }
    if (avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      values.push(avatarUrl ? String(avatarUrl).slice(0, 512) : null);
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at = datetime('now')`);
    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const user = db
      .prepare(
        `SELECT id, username, email, display_name, avatar_url, role, storage_used, created_at, updated_at
         FROM users WHERE id = ?`
      )
      .get(req.user.id);
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        role: user.role,
        storageUsed: user.storage_used,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  })
);

router.post(
  '/password',
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Valid current and new password (min 8) required' });
    }
    if (newPassword.length > 128 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must be 8-128 characters with a letter and a number' });
    }
    const db = getDb();
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const bcrypt = await import('bcryptjs');
    const ok = await bcrypt.compare(currentPassword, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
    const hash = await hashPassword(newPassword);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
      hash,
      req.user.id
    );
    res.json({ ok: true });
  })
);

router.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, user_agent, ip, created_at, last_seen_at, expires_at
         FROM sessions WHERE user_id = ? AND expires_at > datetime('now') ORDER BY last_seen_at DESC`
      )
      .all(req.user.id);
    res.json({
      sessions: rows.map((r) => ({
        id: r.id,
        userAgent: r.user_agent,
        ip: r.ip,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        expiresAt: r.expires_at,
      })),
    });
  })
);

router.delete(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  })
);

export default router;
