import { getDb } from '../db.js';
import { uid } from '../utils/id.js';

function rowToWs(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, isActive: Boolean(r.is_active), sortOrder: r.sort_order,
    state: r.state_json ? safeParse(r.state_json) : { windows: [], apps: [] },
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

export function listWorkspaces(userId) {
  return getDb().prepare(`SELECT * FROM workspaces WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC`).all(userId).map(rowToWs);
}

export function ensureDefaultWorkspace(userId) {
  const existing = listWorkspaces(userId);
  if (existing.length) return existing;
  getDb().prepare(`INSERT INTO workspaces (id, user_id, name, is_active, sort_order, state_json) VALUES (?, ?, 'Desktop 1', 1, 0, '{}')`).run(uid('wks'), userId);
  return listWorkspaces(userId);
}

export function createWorkspace(userId, name = null, state = null) {
  const current = listWorkspaces(userId);
  if (current.length >= 8) { const err = new Error('Maximum of 8 workspaces'); err.status = 400; throw err; }
  const id = uid('wks');
  const label = String(name || `Desktop ${current.length + 1}`).slice(0, 48);
  getDb().prepare(`INSERT INTO workspaces (id, user_id, name, is_active, sort_order, state_json) VALUES (?, ?, ?, 0, ?, ?)`)
    .run(id, userId, label, current.length, JSON.stringify(state || { windows: [], apps: [] }));
  return rowToWs(getDb().prepare('SELECT * FROM workspaces WHERE id = ? AND user_id = ?').get(id, userId));
}

export function updateWorkspace(userId, id, { name, state } = {}) {
  const row = getDb().prepare('SELECT * FROM workspaces WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) { const err = new Error('Workspace not found'); err.status = 404; throw err; }
  if (name != null) getDb().prepare(`UPDATE workspaces SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(String(name).slice(0, 48), id);
  if (state != null) getDb().prepare(`UPDATE workspaces SET state_json = ?, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(state), id);
  return rowToWs(getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(id));
}

export function switchWorkspace(userId, id) {
  const row = getDb().prepare('SELECT id FROM workspaces WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) { const err = new Error('Workspace not found'); err.status = 404; throw err; }
  const db = getDb();
  db.transaction(() => {
    db.prepare(`UPDATE workspaces SET is_active = 0, updated_at = datetime('now') WHERE user_id = ?`).run(userId);
    db.prepare(`UPDATE workspaces SET is_active = 1, updated_at = datetime('now') WHERE id = ?`).run(id);
  })();
  return listWorkspaces(userId);
}

export function deleteWorkspace(userId, id) {
  const all = listWorkspaces(userId);
  if (all.length <= 1) { const err = new Error('Cannot delete the last workspace'); err.status = 400; throw err; }
  const row = all.find((w) => w.id === id);
  if (!row) { const err = new Error('Workspace not found'); err.status = 404; throw err; }
  getDb().prepare('DELETE FROM workspaces WHERE id = ? AND user_id = ?').run(id, userId);
  if (row.isActive) {
    const next = listWorkspaces(userId)[0];
    if (next) switchWorkspace(userId, next.id);
  }
  return listWorkspaces(userId);
}
