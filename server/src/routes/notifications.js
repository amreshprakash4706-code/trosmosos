import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { uid } from '../utils/id.js';
import { broadcastToUser } from '../websocket.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
    const rows = unreadOnly
      ? db
          .prepare(
            `SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT ?`
          )
          .all(req.user.id, limit)
      : db
          .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
          .all(req.user.id, limit);

    res.json({
      notifications: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        type: r.type,
        icon: r.icon,
        data: r.data ? JSON.parse(r.data) : null,
        isRead: Boolean(r.is_read),
        createdAt: r.created_at,
      })),
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, body, type = 'info', icon, data } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const id = uid('ntf');
    const db = getDb();
    db.prepare(
      `INSERT INTO notifications (id, user_id, title, body, type, icon, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.user.id, title, body || null, type, icon || null, data ? JSON.stringify(data) : null);

    const notification = {
      id,
      title,
      body,
      type,
      icon,
      data,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    broadcastToUser(req.user.id, { type: 'notification', payload: notification });
    res.status(201).json(notification);
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const db = getDb();
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(
      req.params.id,
      req.user.id
    );
    res.json({ ok: true });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const db = getDb();
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user.id);
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = getDb();
    db.prepare(`DELETE FROM notifications WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.id);
    res.json({ ok: true });
  })
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const db = getDb();
    db.prepare(`DELETE FROM notifications WHERE user_id = ?`).run(req.user.id);
    res.json({ ok: true });
  })
);

export default router;
