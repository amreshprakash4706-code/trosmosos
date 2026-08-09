import { getDb } from '../db.js';
import { config } from '../config.js';
import { uid, safeName, normalizePath, parentPath, joinPath, mimeFromName } from '../utils/id.js';

function rowToNode(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    isDir: Boolean(row.is_dir),
    mimeType: row.mime_type,
    size: row.size,
    isTrashed: Boolean(row.is_trashed),
    version: row.version,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // content only when explicitly requested
  };
}

export function getNodeByPath(userId, path) {
  const db = getDb();
  const p = normalizePath(path);
  const row = db
    .prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0')
    .get(userId, p);
  return rowToNode(row);
}

export function getNodeById(userId, id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM files WHERE user_id = ? AND id = ?').get(userId, id);
  return rowToNode(row);
}

export function listDirectory(userId, path = '/Home') {
  const db = getDb();
  const p = normalizePath(path);
  const parent = db
    .prepare('SELECT id FROM files WHERE user_id = ? AND path = ? AND is_dir = 1 AND is_trashed = 0')
    .get(userId, p);
  if (!parent && p !== '/') {
    const err = new Error('Directory not found');
    err.status = 404;
    throw err;
  }

  const rows = parent
    ? db
        .prepare(
          `SELECT id, name, path, is_dir, mime_type, size, is_trashed, version, created_at, updated_at
           FROM files WHERE user_id = ? AND parent_id = ? AND is_trashed = 0 ORDER BY is_dir DESC, name COLLATE NOCASE`
        )
        .all(userId, parent.id)
    : db
        .prepare(
          `SELECT id, name, path, is_dir, mime_type, size, is_trashed, version, created_at, updated_at
           FROM files WHERE user_id = ? AND parent_id IS NULL AND is_trashed = 0 ORDER BY is_dir DESC, name COLLATE NOCASE`
        )
        .all(userId);

  return rows.map(rowToNode);
}

export function createFolder(userId, parentPathInput, name) {
  const db = getDb();
  const parentP = normalizePath(parentPathInput || '/Home');
  const clean = safeName(name);
  const fullPath = parentP === '/' ? `/${clean}` : `${parentP}/${clean}`;

  const exists = db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ?').get(userId, fullPath);
  if (exists) {
    const err = new Error('A file or folder with that name already exists');
    err.status = 409;
    throw err;
  }

  let parentId = null;
  if (parentP !== '/') {
    const parent = db
      .prepare('SELECT id, is_dir FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0')
      .get(userId, parentP);
    if (!parent || !parent.is_dir) {
      const err = new Error('Parent directory not found');
      err.status = 404;
      throw err;
    }
    parentId = parent.id;
  }

  enforceQuota(userId, 0);

  const id = uid('fil');
  db.prepare(
    `INSERT INTO files (id, user_id, parent_id, name, path, is_dir, size, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))`
  ).run(id, userId, parentId, clean, fullPath);

  return getNodeByPath(userId, fullPath);
}

export function createFile(userId, parentPathInput, name, content = '') {
  const db = getDb();
  const parentP = normalizePath(parentPathInput || '/Home/Documents');
  const clean = safeName(name);
  const fullPath = parentP === '/' ? `/${clean}` : `${parentP}/${clean}`;
  const body = typeof content === 'string' ? content : String(content || '');
  const size = Buffer.byteLength(body, 'utf8');

  if (size > config.maxFileSizeBytes) {
    const err = new Error(`File exceeds maximum size of ${config.maxFileSizeBytes} bytes`);
    err.status = 413;
    throw err;
  }

  const exists = db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ?').get(userId, fullPath);
  if (exists) {
    const err = new Error('A file or folder with that name already exists');
    err.status = 409;
    throw err;
  }

  const parent = db
    .prepare('SELECT id, is_dir FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0')
    .get(userId, parentP);
  if (!parent || !parent.is_dir) {
    const err = new Error('Parent directory not found');
    err.status = 404;
    throw err;
  }

  enforceQuota(userId, size);

  const id = uid('fil');
  const mime = mimeFromName(clean);
  db.prepare(
    `INSERT INTO files (id, user_id, parent_id, name, path, is_dir, mime_type, size, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(id, userId, parent.id, clean, fullPath, mime, size, body);

  updateStorageUsed(userId, size);
  return getNodeByPath(userId, fullPath);
}

export function readFile(userId, path) {
  const db = getDb();
  const p = normalizePath(path);
  const row = db
    .prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0')
    .get(userId, p);
  if (!row) {
    const err = new Error('File not found');
    err.status = 404;
    throw err;
  }
  if (row.is_dir) {
    const err = new Error('Cannot read a directory as a file');
    err.status = 400;
    throw err;
  }
  return {
    ...rowToNode(row),
    content: row.content ?? (row.content_blob ? row.content_blob.toString('utf8') : ''),
  };
}

export function writeFile(userId, path, content) {
  const db = getDb();
  const p = normalizePath(path);
  const row = db
    .prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0')
    .get(userId, p);
  if (!row) {
    const err = new Error('File not found');
    err.status = 404;
    throw err;
  }
  if (row.is_dir) {
    const err = new Error('Cannot write to a directory');
    err.status = 400;
    throw err;
  }

  const body = typeof content === 'string' ? content : String(content || '');
  const size = Buffer.byteLength(body, 'utf8');
  if (size > config.maxFileSizeBytes) {
    const err = new Error(`File exceeds maximum size of ${config.maxFileSizeBytes} bytes`);
    err.status = 413;
    throw err;
  }

  const delta = size - (row.size || 0);
  if (delta > 0) enforceQuota(userId, delta);

  db.prepare(
    `UPDATE files SET content = ?, size = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?`
  ).run(body, size, row.id);

  if (delta !== 0) updateStorageUsed(userId, delta);
  return readFile(userId, p);
}

export function renameNode(userId, path, newName) {
  const db = getDb();
  const p = normalizePath(path);
  const clean = safeName(newName);
  const row = db
    .prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0')
    .get(userId, p);
  if (!row) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  if (p === '/Home' || p === '/Trash') {
    const err = new Error('Cannot rename system folders');
    err.status = 403;
    throw err;
  }

  const parent = parentPath(p);
  const newPath = parent === '/' ? `/${clean}` : `${parent}/${clean}`;
  if (newPath === p) return rowToNode(row);

  const conflict = db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ?').get(userId, newPath);
  if (conflict) {
    const err = new Error('Name already exists');
    err.status = 409;
    throw err;
  }

  // Update this node and all descendants if directory
  if (row.is_dir) {
    const descendants = db
      .prepare(`SELECT id, path FROM files WHERE user_id = ? AND path LIKE ?`)
      .all(userId, p + '/%');
    const update = db.prepare(`UPDATE files SET path = ?, updated_at = datetime('now') WHERE id = ?`);
    for (const d of descendants) {
      const updated = newPath + d.path.slice(p.length);
      update.run(updated, d.id);
    }
  }

  db.prepare(`UPDATE files SET name = ?, path = ?, updated_at = datetime('now') WHERE id = ?`).run(
    clean,
    newPath,
    row.id
  );
  return getNodeByPath(userId, newPath);
}

export function moveNode(userId, path, newParentPath) {
  const db = getDb();
  const p = normalizePath(path);
  const destParent = normalizePath(newParentPath || '/Home');
  const row = db
    .prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0')
    .get(userId, p);
  if (!row) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  if (p === '/Home' || p === '/Trash') {
    const err = new Error('Cannot move system folders');
    err.status = 403;
    throw err;
  }

  const parentRow = db
    .prepare('SELECT id, is_dir FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0')
    .get(userId, destParent);
  if (!parentRow || !parentRow.is_dir) {
    const err = new Error('Destination directory not found');
    err.status = 404;
    throw err;
  }

  // Prevent moving into itself
  if (row.is_dir && (destParent === p || destParent.startsWith(p + '/'))) {
    const err = new Error('Cannot move a folder into itself');
    err.status = 400;
    throw err;
  }

  const newPath = destParent === '/' ? `/${row.name}` : `${destParent}/${row.name}`;
  const conflict = db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ?').get(userId, newPath);
  if (conflict) {
    const err = new Error('An item with that name already exists in the destination');
    err.status = 409;
    throw err;
  }

  if (row.is_dir) {
    const descendants = db
      .prepare(`SELECT id, path FROM files WHERE user_id = ? AND path LIKE ?`)
      .all(userId, p + '/%');
    const update = db.prepare(`UPDATE files SET path = ?, updated_at = datetime('now') WHERE id = ?`);
    for (const d of descendants) {
      update.run(newPath + d.path.slice(p.length), d.id);
    }
  }

  db.prepare(
    `UPDATE files SET parent_id = ?, path = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(parentRow.id, newPath, row.id);

  return getNodeByPath(userId, newPath);
}

export function trashNode(userId, path) {
  const db = getDb();
  const p = normalizePath(path);
  if (p === '/Home' || p === '/Trash') {
    const err = new Error('Cannot delete system folders');
    err.status = 403;
    throw err;
  }
  const row = db
    .prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0')
    .get(userId, p);
  if (!row) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }

  // Soft delete this + descendants
  db.prepare(
    `UPDATE files SET is_trashed = 1, trashed_at = datetime('now'), updated_at = datetime('now')
     WHERE user_id = ? AND (path = ? OR path LIKE ?)`
  ).run(userId, p, p + '/%');

  return { ok: true, path: p };
}

export function restoreNode(userId, path) {
  const db = getDb();
  const p = normalizePath(path);
  const row = db
    .prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 1')
    .get(userId, p);
  if (!row) {
    const err = new Error('Not found in trash');
    err.status = 404;
    throw err;
  }

  db.prepare(
    `UPDATE files SET is_trashed = 0, trashed_at = NULL, updated_at = datetime('now')
     WHERE user_id = ? AND (path = ? OR path LIKE ?)`
  ).run(userId, p, p + '/%');

  return getNodeByPath(userId, p);
}

export function permanentlyDelete(userId, path) {
  const db = getDb();
  const p = normalizePath(path);
  const rows = db
    .prepare(`SELECT id, size FROM files WHERE user_id = ? AND (path = ? OR path LIKE ?)`)
    .all(userId, p, p + '/%');
  if (!rows.length) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  let freed = 0;
  for (const r of rows) freed += r.size || 0;
  db.prepare(`DELETE FROM files WHERE user_id = ? AND (path = ? OR path LIKE ?)`).run(userId, p, p + '/%');
  if (freed) updateStorageUsed(userId, -freed);
  return { ok: true, freed };
}

export function searchFiles(userId, query, limit = 50) {
  const db = getDb();
  const q = `%${String(query || '').trim()}%`;
  if (q === '%%') return [];
  const rows = db
    .prepare(
      `SELECT id, name, path, is_dir, mime_type, size, created_at, updated_at
       FROM files WHERE user_id = ? AND is_trashed = 0 AND (name LIKE ? OR path LIKE ?)
       ORDER BY is_dir DESC, name COLLATE NOCASE LIMIT ?`
    )
    .all(userId, q, q, Math.min(limit, 100));
  return rows.map(rowToNode);
}

export function getTree(userId, root = '/Home') {
  const db = getDb();
  const p = normalizePath(root);
  const rows = db
    .prepare(
      `SELECT id, name, path, is_dir, mime_type, size, parent_id, created_at, updated_at
       FROM files WHERE user_id = ? AND is_trashed = 0 AND (path = ? OR path LIKE ?)
       ORDER BY path`
    )
    .all(userId, p, p + '/%');
  return rows.map(rowToNode);
}

export function getStorageStats(userId) {
  const db = getDb();
  const user = db.prepare('SELECT storage_used FROM users WHERE id = ?').get(userId);
  const count = db
    .prepare('SELECT COUNT(*) as c FROM files WHERE user_id = ? AND is_trashed = 0')
    .get(userId);
  return {
    used: user?.storage_used || 0,
    limit: config.maxStorageBytes,
    files: count?.c || 0,
    maxFiles: config.maxFilesPerUser,
  };
}

function enforceQuota(userId, additionalBytes) {
  const db = getDb();
  const user = db.prepare('SELECT storage_used FROM users WHERE id = ?').get(userId);
  const used = user?.storage_used || 0;
  if (used + additionalBytes > config.maxStorageBytes) {
    const err = new Error('Storage quota exceeded');
    err.status = 413;
    throw err;
  }
  const count = db
    .prepare('SELECT COUNT(*) as c FROM files WHERE user_id = ? AND is_trashed = 0')
    .get(userId);
  if ((count?.c || 0) >= config.maxFilesPerUser) {
    const err = new Error('Maximum number of files reached');
    err.status = 413;
    throw err;
  }
}

function updateStorageUsed(userId, delta) {
  const db = getDb();
  db.prepare(
    `UPDATE users SET storage_used = MAX(0, storage_used + ?), updated_at = datetime('now') WHERE id = ?`
  ).run(delta, userId);
}

export function exportTreeAsClientFormat(userId) {
  // Convert server tree into the shape the existing client VFS expects
  const nodes = getTree(userId, '/');
  // Client uses a flat array of {id, name, type, parent, content?, size?, modified?}
  // We produce a compatible representation for optional sync.
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.isDir ? 'folder' : 'file',
    parent: parentPath(n.path) || null,
    path: n.path,
    size: n.size,
    mime: n.mimeType,
    modified: n.updatedAt,
  }));
}
