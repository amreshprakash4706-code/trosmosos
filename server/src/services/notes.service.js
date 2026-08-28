import { getDb } from '../db.js';
import { uid, safeName } from '../utils/id.js';
import * as vfs from './vfs.service.js';

function rowToNote(r) {
  if (!r) return null;
  return { id: r.id, title: r.title, path: r.path, pinned: Boolean(r.pinned), updatedAt: r.updated_at, createdAt: r.created_at, preview: r.preview || '' };
}

export function listNotes(userId) {
  return getDb().prepare(`SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC`).all(userId).map(rowToNote);
}

export function getNote(userId, id) {
  const row = getDb().prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) { const err = new Error('Note not found'); err.status = 404; throw err; }
  let content = row.content || '';
  if (row.path) {
    try { content = vfs.readFile(userId, row.path).content || content; } catch (_) {}
  }
  return { ...rowToNote(row), content };
}

export function createNote(userId, { title, content = '', persistToVfs = true } = {}) {
  const db = getDb();
  const id = uid('nte');
  const cleanTitle = String(title || 'Untitled note').slice(0, 120);
  let path = null;
  if (persistToVfs) {
    const fname = safeName(cleanTitle.endsWith('.md') ? cleanTitle : `${cleanTitle}.md`);
    try {
      path = vfs.createFile(userId, '/Home/Documents', fname, content || '').path;
    } catch (e) {
      if (e.status === 409) path = vfs.createFile(userId, '/Home/Documents', `${Date.now()}-${fname}`, content || '').path;
      else throw e;
    }
  }
  const preview = String(content || '').slice(0, 180);
  db.prepare(`INSERT INTO notes (id, user_id, title, path, content, preview, pinned) VALUES (?, ?, ?, ?, ?, ?, 0)`)
    .run(id, userId, cleanTitle, path, persistToVfs ? null : content, preview);
  return getNote(userId, id);
}

export function updateNote(userId, id, { title, content, pinned } = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) { const err = new Error('Note not found'); err.status = 404; throw err; }
  if (title != null) db.prepare(`UPDATE notes SET title = ?, updated_at = datetime('now') WHERE id = ?`).run(String(title).slice(0, 120), id);
  if (typeof pinned === 'boolean') db.prepare(`UPDATE notes SET pinned = ?, updated_at = datetime('now') WHERE id = ?`).run(pinned ? 1 : 0, id);
  if (content != null) {
    const preview = String(content).slice(0, 180);
    if (row.path) {
      try {
        vfs.writeFile(userId, row.path, content);
        db.prepare(`UPDATE notes SET preview = ?, content = NULL, updated_at = datetime('now') WHERE id = ?`).run(preview, id);
      } catch {
        db.prepare(`UPDATE notes SET content = ?, preview = ?, updated_at = datetime('now') WHERE id = ?`).run(content, preview, id);
      }
    } else {
      db.prepare(`UPDATE notes SET content = ?, preview = ?, updated_at = datetime('now') WHERE id = ?`).run(content, preview, id);
    }
  }
  return getNote(userId, id);
}

export function deleteNote(userId, id, { trashFile = false } = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) { const err = new Error('Note not found'); err.status = 404; throw err; }
  if (trashFile && row.path) { try { vfs.trashNode(userId, row.path); } catch (_) {} }
  db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId);
  return { ok: true };
}

export function searchNotes(userId, query, limit = 20) {
  const q = `%${String(query || '').trim()}%`;
  if (q === '%%') return [];
  return getDb().prepare(`SELECT id, title, path, preview, pinned, updated_at FROM notes
     WHERE user_id = ? AND (title LIKE ? OR preview LIKE ? OR content LIKE ?)
     ORDER BY pinned DESC, updated_at DESC LIMIT ?`)
    .all(userId, q, q, q, Math.min(limit, 50)).map(rowToNote);
}
