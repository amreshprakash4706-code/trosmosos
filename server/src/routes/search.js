import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import * as vfs from '../services/vfs.service.js';
import { getDb } from '../db.js';
import { searchNotes } from '../services/notes.service.js';

const router = Router();
router.use(requireAuth);

const BUILTIN_APPS = [
  { id: 'ai', name: 'Trosmos AI', category: 'System' },
  { id: 'files', name: 'Files', category: 'System' },
  { id: 'browser', name: 'Browser', category: 'Internet' },
  { id: 'settings', name: 'Settings', category: 'System' },
  { id: 'app-store', name: 'App Store', category: 'System' },
  { id: 'task-manager', name: 'Task Manager', category: 'System' },
  { id: 'terminal', name: 'Terminal', category: 'System' },
  { id: 'calculator', name: 'Calculator', category: 'Utilities' },
  { id: 'notes', name: 'Notes', category: 'Productivity' },
  { id: 'clock', name: 'Clock', category: 'Utilities' },
  { id: 'clipboard', name: 'Clipboard', category: 'Utilities' },
  { id: 'help', name: 'Help', category: 'System' },
];

const SETTINGS_ENTRIES = [
  { id: 'theme', name: 'Theme', path: 'Appearance' },
  { id: 'accent', name: 'Accent color', path: 'Appearance' },
  { id: 'wallpaper', name: 'Wallpaper', path: 'Appearance' },
  { id: 'notifications', name: 'Notifications', path: 'System' },
  { id: 'privacy', name: 'Privacy', path: 'Privacy' },
  { id: 'ai_permissions', name: 'AI permissions', path: 'AI' },
  { id: 'accessibility', name: 'Accessibility', path: 'Accessibility' },
];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) {
      return res.json({ query: '', results: [] });
    }

    const results = [];

    // Apps
    for (const app of BUILTIN_APPS) {
      if (app.name.toLowerCase().includes(q) || app.id.includes(q) || app.category.toLowerCase().includes(q)) {
        results.push({ type: 'app', id: app.id, title: app.name, subtitle: app.category, score: 10 });
      }
    }

    // Settings
    for (const s of SETTINGS_ENTRIES) {
      if (s.name.toLowerCase().includes(q) || s.id.includes(q)) {
        results.push({ type: 'setting', id: s.id, title: s.name, subtitle: s.path, score: 8 });
      }
    }

    // Files
    const files = vfs.searchFiles(req.user.id, q, 20);
    for (const f of files) {
      results.push({
        type: f.isDir ? 'folder' : 'file',
        id: f.id,
        title: f.name,
        subtitle: f.path,
        path: f.path,
        score: 6,
      });
    }

    // Notifications (recent matching)
    const db = getDb();
    const notifs = db
      .prepare(
        `SELECT id, title, body, type, created_at FROM notifications
         WHERE user_id = ? AND (title LIKE ? OR body LIKE ?) ORDER BY created_at DESC LIMIT 5`
      )
      .all(req.user.id, `%${q}%`, `%${q}%`);
    for (const n of notifs) {
      results.push({
        type: 'notification',
        id: n.id,
        title: n.title,
        subtitle: n.body || n.type,
        score: 4,
      });
    }

    const notes = searchNotes(req.user.id, q, 8);
    for (const n of notes) {
      results.push({ type: 'note', id: n.id, title: n.title, subtitle: n.preview || n.path, path: n.path, score: 7 });
    }
    const tasks = db.prepare(
      `SELECT id, title, status, type FROM tasks WHERE user_id = ? AND title LIKE ? ORDER BY created_at DESC LIMIT 5`
    ).all(req.user.id, `%${q}%`);
    for (const tk of tasks) {
      results.push({ type: 'task', id: tk.id, title: tk.title, subtitle: `${tk.type} · ${tk.status}`, score: 5 });
    }
    results.sort((a, b) => b.score - a.score);
    res.json({ query: q, results: results.slice(0, 40) });
  })
);

export default router;
