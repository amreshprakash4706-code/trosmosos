/**
 * Capability / least-privilege service for Trosmos OS 5.0.
 * Every privileged action (especially AI tools) must pass through assertCapability.
 */
import { getDb } from '../db.js';
import { uid } from '../utils/id.js';
import { normalizePath } from '../utils/id.js';

export const SCOPES = Object.freeze({
  VFS_READ: 'vfs:read',
  VFS_WRITE: 'vfs:write',
  VFS_DELETE: 'vfs:delete',
  AI_TOOL: 'ai:tool',
  APP_INSTALL: 'app:install',
  ADMIN: 'admin',
});

export function grantCapability(userId, scope, resource = null, expiresAt = null) {
  const db = getDb();
  const id = uid('cap');
  const res = resource ? normalizePath(resource) : null;
  db.prepare(
    `INSERT OR IGNORE INTO capabilities (id, user_id, scope, resource, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, scope, res, expiresAt);
  return id;
}

export function revokeCapability(userId, scope, resource = null) {
  const db = getDb();
  if (resource == null) {
    db.prepare(`DELETE FROM capabilities WHERE user_id = ? AND scope = ? AND resource IS NULL`).run(userId, scope);
  } else {
    db.prepare(`DELETE FROM capabilities WHERE user_id = ? AND scope = ? AND resource = ?`).run(userId, scope, normalizePath(resource));
  }
}

export function hasCapability(userId, scope, resource = null) {
  const db = getDb();
  // Admins implicitly have everything
  const user = db.prepare(`SELECT role FROM users WHERE id = ?`).get(userId);
  if (user?.role === 'admin') return true;

  const rows = db.prepare(
    `SELECT resource FROM capabilities
     WHERE user_id = ? AND scope = ?
       AND (expires_at IS NULL OR expires_at > datetime('now'))`
  ).all(userId, scope);

  if (rows.length === 0) return false;
  if (resource == null) return true;

  const norm = normalizePath(resource);
  return rows.some((r) => {
    if (r.resource == null || r.resource === '/') return true;
    const prefix = normalizePath(r.resource);
    return norm === prefix || norm.startsWith(prefix + '/');
  });
}

export function assertCapability(userId, scope, resource = null) {
  if (!hasCapability(userId, scope, resource)) {
    const err = new Error(`Capability denied: ${scope}`);
    err.status = 403;
    err.code = 'CAPABILITY_DENIED';
    throw err;
  }
}

/** Grant the standard personal-computing capability set to a new user. */
export function grantDefaultCapabilities(userId) {
  grantCapability(userId, SCOPES.VFS_READ, '/');
  grantCapability(userId, SCOPES.VFS_WRITE, '/');
  grantCapability(userId, SCOPES.VFS_DELETE, '/');
  grantCapability(userId, SCOPES.AI_TOOL, null);
}

export function listCapabilities(userId) {
  return getDb().prepare(
    `SELECT id, scope, resource, granted_at, expires_at FROM capabilities WHERE user_id = ?`
  ).all(userId);
}
