import { getDb } from '../db.js';
import { normalizePath } from '../utils/id.js';

export function recordRecent(userId, { kind, ref, title, path = null }) {
  const db = getDb();
  const p = path ? normalizePath(path) : null;
  const existing = db.prepare(`SELECT id FROM recent_items WHERE user_id = ? AND kind = ? AND ref = ?`).get(userId, kind, ref);
  if (existing) {
    db.prepare(`UPDATE recent_items SET title = ?, path = ?, accessed_at = datetime('now') WHERE id = ?`).run(title || null, p, existing.id);
  } else {
    db.prepare(`INSERT INTO recent_items (user_id, kind, ref, title, path, accessed_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
      .run(userId, kind, ref, title || null, p);
  }
  db.prepare(`DELETE FROM recent_items WHERE user_id = ? AND id NOT IN (
       SELECT id FROM recent_items WHERE user_id = ? ORDER BY accessed_at DESC LIMIT 80
     )`).run(userId, userId);
}

export function listRecent(userId, limit = 30) {
  return getDb().prepare(`SELECT id, kind, ref, title, path, accessed_at FROM recent_items WHERE user_id = ? ORDER BY accessed_at DESC LIMIT ?`)
    .all(userId, Math.min(Number(limit) || 30, 80));
}

export function addFavorite(userId, path, title = null) {
  const p = normalizePath(path);
  getDb().prepare(`INSERT OR IGNORE INTO favorites (user_id, path, title, created_at) VALUES (?, ?, ?, datetime('now'))`).run(userId, p, title);
  return { ok: true, path: p, favorite: true };
}

export function removeFavorite(userId, path) {
  const p = normalizePath(path);
  getDb().prepare('DELETE FROM favorites WHERE user_id = ? AND path = ?').run(userId, p);
  return { ok: true, path: p, favorite: false };
}

export function listFavorites(userId) {
  return getDb().prepare(`SELECT path, title, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
}

export function isFavorite(userId, path) {
  return Boolean(getDb().prepare('SELECT 1 FROM favorites WHERE user_id = ? AND path = ?').get(userId, normalizePath(path)));
}
