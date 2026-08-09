import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { uid } from '../utils/id.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const status = req.query.status;
    let rows;
    if (status) {
      rows = db
        .prepare(
          `SELECT * FROM tasks WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100`
        )
        .all(req.user.id, status);
    } else {
      rows = db
        .prepare(`SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`)
        .all(req.user.id);
    }
    res.json({
      tasks: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        status: r.status,
        progress: r.progress,
        payload: r.payload ? JSON.parse(r.payload) : null,
        result: r.result ? JSON.parse(r.result) : null,
        error: r.error,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        completedAt: r.completed_at,
      })),
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { type = 'generic', title, payload } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const id = uid('tsk');
    const db = getDb();
    db.prepare(
      `INSERT INTO tasks (id, user_id, type, title, status, payload)
       VALUES (?, ?, ?, ?, 'pending', ?)`
    ).run(id, req.user.id, type, title, payload ? JSON.stringify(payload) : null);
    res.status(201).json({ id, type, title, status: 'pending' });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { status, progress, result, error } = req.body || {};
    const db = getDb();
    const existing = db
      .prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const fields = [];
    const values = [];
    if (status) {
      fields.push('status = ?');
      values.push(status);
      if (['completed', 'failed', 'cancelled'].includes(status)) {
        fields.push(`completed_at = datetime('now')`);
      }
    }
    if (typeof progress === 'number') {
      fields.push('progress = ?');
      values.push(progress);
    }
    if (result !== undefined) {
      fields.push('result = ?');
      values.push(JSON.stringify(result));
    }
    if (error !== undefined) {
      fields.push('error = ?');
      values.push(String(error));
    }
    fields.push(`updated_at = datetime('now')`);
    values.push(req.params.id, req.user.id);

    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    res.json({ ok: true });
  })
);

router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const db = getDb();
    db.prepare(
      `UPDATE tasks SET status = 'cancelled', updated_at = datetime('now'), completed_at = datetime('now')
       WHERE id = ? AND user_id = ? AND status IN ('pending','running')`
    ).run(req.params.id, req.user.id);
    res.json({ ok: true });
  })
);

export default router;
