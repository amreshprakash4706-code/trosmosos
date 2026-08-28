/**
 * In-process background job engine.
 * Jobs persist in SQLite and are executed by a single worker loop.
 */
import { getDb } from '../db.js';
import { uid } from '../utils/id.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { pushToUser } from '../websocket.js';
import * as vfs from './vfs.service.js';

const HANDLERS = new Map();
const MAX_ATTEMPTS = 3;
let running = false;
let timer = null;

function rowToJob(r) {
  if (!r) return null;
  return {
    id: r.id, type: r.type, title: r.title, status: r.status,
    progress: r.progress ?? 0,
    payload: r.payload ? safeParse(r.payload) : null,
    result: r.result ? safeParse(r.result) : null,
    error: r.error, attempts: r.attempts ?? 0,
    createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
  };
}
function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }

export function registerJobHandler(type, fn) { HANDLERS.set(type, fn); }

export function listJobs(userId, status = null, limit = 100) {
  const db = getDb();
  const cap = Math.min(Number(limit) || 100, 200);
  if (status) {
    return db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?`)
      .all(userId, status, cap).map(rowToJob);
  }
  return db.prepare(`SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, cap).map(rowToJob);
}

export function getJob(userId, id) {
  return rowToJob(getDb().prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId));
}

export function enqueueJob(userId, { type, title, payload = null }) {
  const db = getDb();
  const id = uid('tsk');
  db.prepare(`INSERT INTO tasks (id, user_id, type, title, status, progress, payload, attempts) VALUES (?, ?, ?, ?, 'pending', 0, ?, 0)`)
    .run(id, userId, type || 'generic', title || type || 'Job', payload ? JSON.stringify(payload) : null);
  pushToUser(userId, { type: 'task.queued', payload: { id, type, title } });
  kick();
  return getJob(userId, id);
}

export function cancelJob(userId, id) {
  const db = getDb();
  const row = db.prepare(`SELECT id, status FROM tasks WHERE id = ? AND user_id = ?`).get(id, userId);
  if (!row) { const err = new Error('Task not found'); err.status = 404; throw err; }
  if (!['pending', 'running'].includes(row.status)) return getJob(userId, id);
  db.prepare(`UPDATE tasks SET status = 'cancelled', updated_at = datetime('now'), completed_at = datetime('now') WHERE id = ? AND user_id = ?`).run(id, userId);
  pushToUser(userId, { type: 'task.cancelled', payload: { id } });
  return getJob(userId, id);
}

function setJob(id, fields) {
  const db = getDb();
  const sets = []; const vals = [];
  for (const [k, v] of Object.entries(fields)) { sets.push(`${k} = ?`); vals.push(v); }
  sets.push(`updated_at = datetime('now')`);
  vals.push(id);
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

async function processOne() {
  const db = getDb();
  const job = db.prepare(`SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`).get();
  if (!job) return false;
  setJob(job.id, { status: 'running', progress: 0.05, attempts: (job.attempts || 0) + 1 });
  pushToUser(job.user_id, { type: 'task.running', payload: { id: job.id } });
  const handler = HANDLERS.get(job.type);
  const ctx = {
    userId: job.user_id, id: job.id,
    payload: job.payload ? safeParse(job.payload) : {},
    progress(p) {
      const n = Math.max(0, Math.min(1, Number(p) || 0));
      setJob(job.id, { status: 'running', progress: n });
      pushToUser(job.user_id, { type: 'task.progress', payload: { id: job.id, progress: n } });
    },
    isCancelled() { return db.prepare('SELECT status FROM tasks WHERE id = ?').get(job.id)?.status === 'cancelled'; },
  };
  try {
    let result;
    if (typeof handler === 'function') result = await handler(ctx);
    else if (job.type === 'generic') { ctx.progress(1); result = { ok: true, note: 'No handler registered for generic jobs' }; }
    else throw new Error(`Unknown job type: ${job.type}`);
    if (db.prepare('SELECT status FROM tasks WHERE id = ?').get(job.id)?.status === 'cancelled') return true;
    setJob(job.id, {
      status: 'completed', progress: 1, result: JSON.stringify(result ?? { ok: true }),
      completed_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    });
    pushToUser(job.user_id, { type: 'task.completed', payload: { id: job.id, result } });
  } catch (e) {
    const attempts = (job.attempts || 0) + 1;
    if (attempts < MAX_ATTEMPTS && job.type !== 'generic') {
      setJob(job.id, { status: 'pending', error: String(e.message || e), attempts });
      logger.warn('job.retry', { id: job.id, attempts, error: e.message });
    } else {
      setJob(job.id, {
        status: 'failed', error: String(e.message || e),
        completed_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      });
      pushToUser(job.user_id, { type: 'task.failed', payload: { id: job.id, error: e.message } });
      logger.error('job.failed', { id: job.id, type: job.type, error: e.message });
    }
  }
  return true;
}

export function kick() {
  if (running) return;
  running = true;
  (async () => { try { while (await processOne()) { /* drain */ } } finally { running = false; } })();
}

export function startJobWorker() {
  if (timer) return;
  timer = setInterval(() => kick(), 1500);
  timer.unref?.();
  kick();
}

export function stopJobWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

registerJobHandler('empty_trash', async (ctx) => {
  ctx.progress(0.2);
  const result = vfs.emptyTrash(ctx.userId);
  ctx.progress(1);
  return result;
});

registerJobHandler('export_backup', async (ctx) => {
  ctx.progress(0.1);
  const tree = vfs.getTree(ctx.userId, '/');
  ctx.progress(0.6);
  const settings = getDb().prepare('SELECT key, value FROM settings WHERE user_id = ?').all(ctx.userId);
  ctx.progress(0.9);
  return { version: config.version, exportedAt: new Date().toISOString(), files: tree.length, settings: settings.length };
});

registerJobHandler('inspect_folder', async (ctx) => {
  const path = ctx.payload?.path || '/Home';
  ctx.progress(0.2);
  const tree = vfs.getTree(ctx.userId, path);
  const files = tree.filter((n) => !n.isDir);
  const folders = tree.filter((n) => n.isDir);
  ctx.progress(1);
  return { path, files: files.length, folders: folders.length, bytes: files.reduce((s, n) => s + (n.size || 0), 0) };
});

registerJobHandler('organize_report', async (ctx) => {
  const path = ctx.payload?.path || '/Home';
  ctx.progress(0.3);
  const items = vfs.listDirectory(ctx.userId, path);
  const byExt = {};
  for (const n of items) {
    if (n.isDir) continue;
    const ext = (n.name.split('.').pop() || '').toLowerCase();
    byExt[ext] = (byExt[ext] || 0) + 1;
  }
  ctx.progress(1);
  return { path, count: items.length, byExt };
});

export default { enqueueJob, listJobs, getJob, cancelJob, startJobWorker, kick };
