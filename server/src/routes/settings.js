import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(requireAuth);

const ALLOWED_KEYS = new Set([
  'theme',
  'accent',
  'wallpaper',
  'motion',
  'language',
  'notifications',
  'privacy',
  'ai_permissions',
  'keyboard_shortcuts',
  'accessibility',
  'desktop_icons',
  'dock_position',
  'clock_format',
  'startup_apps',
  'window_states',
  'workspaces',
  'reduced_motion',
  'font_scale',
  'high_contrast',
  'shortcut_overrides',
  'sync',
  'custom',
]);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT key, value, updated_at FROM settings WHERE user_id = ?').all(req.user.id);
    const settings = {};
    for (const r of rows) {
      try {
        settings[r.key] = JSON.parse(r.value);
      } catch {
        settings[r.key] = r.value;
      }
    }
    res.json({ settings });
  })
);

router.get(
  '/:key',
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    if (!ALLOWED_KEYS.has(key) && key !== 'custom') {
      return res.status(400).json({ error: 'Invalid settings key' });
    }
    const db = getDb();
    const row = db.prepare('SELECT value, updated_at FROM settings WHERE user_id = ? AND key = ?').get(req.user.id, key);
    if (!row) return res.json({ key, value: null });
    let value;
    try {
      value = JSON.parse(row.value);
    } catch {
      value = row.value;
    }
    res.json({ key, value, updatedAt: row.updated_at });
  })
);

router.put(
  '/:key',
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    if (!ALLOWED_KEYS.has(key)) {
      return res.status(400).json({ error: 'Invalid settings key' });
    }
    const value = req.body?.value ?? req.body;
    const db = getDb();
    db.prepare(
      `INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).run(req.user.id, key, JSON.stringify(value));
    res.json({ key, value, ok: true });
  })
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const payload = req.body?.settings || req.body || {};
    const db = getDb();
    const upsert = db.prepare(
      `INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    );
    const tx = db.transaction((entries) => {
      for (const [key, value] of entries) {
        if (!ALLOWED_KEYS.has(key)) continue;
        upsert.run(req.user.id, key, JSON.stringify(value));
      }
    });
    tx(Object.entries(payload));
    res.json({ ok: true });
  })
);

export default router;
