import { getDb } from '../db.js';
import { config } from '../config.js';
import * as vfs from './vfs.service.js';
import { listNotes } from './notes.service.js';
import { listWorkspaces } from './workspace.service.js';
import { listFavorites } from './activity.service.js';

export function exportUserData(userId) {
  const db = getDb();
  const files = vfs.getTree(userId, '/');
  const fileContents = [];
  for (const n of files) {
    if (n.isDir) { fileContents.push({ path: n.path, isDir: true, name: n.name }); continue; }
    try {
      const full = vfs.readFile(userId, n.path);
      fileContents.push({ path: n.path, isDir: false, name: n.name, mimeType: full.mimeType, encoding: full.encoding, content: full.content, size: full.size });
    } catch (_) {
      fileContents.push({ path: n.path, isDir: false, name: n.name, error: 'unreadable' });
    }
  }
  const settingsRows = db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(userId);
  const settings = {};
  for (const r of settingsRows) {
    try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
  }
  return {
    format: 'trosmos-backup', version: config.version, exportedAt: new Date().toISOString(),
    files: fileContents, settings, notes: listNotes(userId), workspaces: listWorkspaces(userId), favorites: listFavorites(userId),
  };
}

export function importUserData(userId, payload, { overwrite = false } = {}) {
  if (!payload || payload.format !== 'trosmos-backup') {
    const err = new Error('Invalid backup format'); err.status = 400; throw err;
  }
  const files = Array.isArray(payload.files) ? payload.files : [];
  let imported = 0, skipped = 0;
  const dirs = files.filter((f) => f.isDir).sort((a, b) => a.path.length - b.path.length);
  const regular = files.filter((f) => !f.isDir);
  for (const d of dirs) {
    if (!d.path || d.path === '/Home' || d.path === '/Trash' || d.path === '/') continue;
    const parent = d.path.slice(0, d.path.lastIndexOf('/')) || '/Home';
    const name = d.name || d.path.split('/').pop();
    try { vfs.createFolder(userId, parent, name); imported++; } catch { skipped++; }
  }
  for (const f of regular) {
    if (!f.path || f.error) { skipped++; continue; }
    const parent = f.path.slice(0, f.path.lastIndexOf('/')) || '/Home/Documents';
    const name = f.name || f.path.split('/').pop();
    const content = f.encoding === 'base64' && typeof f.content === 'string' ? Buffer.from(f.content, 'base64') : (f.content || '');
    try { vfs.createFile(userId, parent, name, content); imported++; }
    catch (e) {
      if (e.status === 409 && overwrite) {
        try { vfs.writeFile(userId, f.path, content); imported++; } catch { skipped++; }
      } else skipped++;
    }
  }
  if (payload.settings && typeof payload.settings === 'object') {
    const db = getDb();
    const upsert = db.prepare(`INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`);
    for (const [k, v] of Object.entries(payload.settings)) upsert.run(userId, k, JSON.stringify(v));
  }
  return { ok: true, imported, skipped };
}
