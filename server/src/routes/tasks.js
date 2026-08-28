import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { enqueueJob, cancelJob, getJob, listJobs, kick } from '../services/jobs.service.js';

const router = Router();
router.use(requireAuth);
const ALLOWED_STATUS = new Set(['pending', 'running', 'completed', 'failed', 'cancelled']);

router.get('/', asyncHandler(async (req, res) => {
  res.json({ tasks: listJobs(req.user.id, req.query.status || null) });
}));
router.get('/:id', asyncHandler(async (req, res) => {
  const job = getJob(req.user.id, req.params.id);
  if (!job) return res.status(404).json({ error: 'Task not found' });
  res.json(job);
}));
router.post('/', asyncHandler(async (req, res) => {
  const { type = 'generic', title, payload } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const job = enqueueJob(req.user.id, { type, title, payload });
  kick();
  res.status(201).json(job);
}));
router.patch('/:id', asyncHandler(async (req, res) => {
  const { status, progress, result, error } = req.body || {};
  const db = getDb();
  const existing = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const fields = []; const values = [];
  if (status) {
    if (!ALLOWED_STATUS.has(status)) return res.status(400).json({ error: 'Invalid status' });
    fields.push('status = ?'); values.push(status);
    if (['completed', 'failed', 'cancelled'].includes(status)) fields.push(`completed_at = datetime('now')`);
  }
  if (typeof progress === 'number') { fields.push('progress = ?'); values.push(Math.max(0, Math.min(1, progress))); }
  if (result !== undefined) { fields.push('result = ?'); values.push(JSON.stringify(result)); }
  if (error !== undefined) { fields.push('error = ?'); values.push(String(error).slice(0, 2000)); }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  fields.push(`updated_at = datetime('now')`);
  values.push(req.params.id, req.user.id);
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
  res.json({ ok: true });
}));
router.post('/:id/cancel', asyncHandler(async (req, res) => {
  res.json(cancelJob(req.user.id, req.params.id));
}));
export default router;
