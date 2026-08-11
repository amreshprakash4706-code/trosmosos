import { getDb } from '../db.js';
import { config } from '../config.js';
import { uid, safeName, normalizePath, parentPath, mimeFromName } from '../utils/id.js';

function rowToNode(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, path: row.path, isDir: Boolean(row.is_dir),
    mimeType: row.mime_type, size: row.size, isTrashed: Boolean(row.is_trashed),
    version: row.version, metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function getNodeByPath(userId, path) {
  const db = getDb();
  const p = normalizePath(path);
  const row = db.prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, p);
  return rowToNode(row);
}

export function getNodeById(userId, id) {
  const db = getDb();
  return rowToNode(db.prepare('SELECT * FROM files WHERE user_id = ? AND id = ?').get(userId, id));
}

export function listDirectory(userId, path = '/Home') {
  const db = getDb();
  const p = normalizePath(path);
  const parent = db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ? AND is_dir = 1 AND is_trashed = 0').get(userId, p);
  if (!parent && p !== '/') {
    const err = new Error('Directory not found'); err.status = 404; throw err;
  }
  const rows = parent
    ? db.prepare(`SELECT id, name, path, is_dir, mime_type, size, is_trashed, version, created_at, updated_at FROM files WHERE user_id = ? AND parent_id = ? AND is_trashed = 0 ORDER BY is_dir DESC, name COLLATE NOCASE`).all(userId, parent.id)
    : db.prepare(`SELECT id, name, path, is_dir, mime_type, size, is_trashed, version, created_at, updated_at FROM files WHERE user_id = ? AND parent_id IS NULL AND is_trashed = 0 ORDER BY is_dir DESC, name COLLATE NOCASE`).all(userId);
  return rows.map(rowToNode);
}

export function createFolder(userId, parentPathInput, name) {
  const db = getDb();
  const parentP = normalizePath(parentPathInput || '/Home');
  const clean = safeName(name);
  const fullPath = parentP === '/' ? `/${clean}` : `${parentP}/${clean}`;
  if (db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, fullPath)) {
    const err = new Error('A file or folder with that name already exists'); err.status = 409; throw err;
  }
  const parent = db.prepare('SELECT id, is_dir FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, parentP);
  if (!parent || !parent.is_dir) { const err = new Error('Parent directory not found'); err.status = 404; throw err; }
  enforceQuota(userId, 0);
  const id = uid('fil');
  db.prepare(`INSERT INTO files (id, user_id, parent_id, name, path, is_dir, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))`).run(id, userId, parent.id, clean, fullPath);
  return getNodeByPath(userId, fullPath);
}

export function createFile(userId, parentPathInput, name, content = '') {
  const db = getDb();
  const parentP = normalizePath(parentPathInput || '/Home/Documents');
  const clean = safeName(name);
  const fullPath = parentP === '/' ? `/${clean}` : `${parentP}/${clean}`;
  const body = typeof content === 'string' ? content : String(content || '');
  const size = Buffer.byteLength(body, 'utf8');
  if (size > config.maxFileSizeBytes) { const err = new Error(`File exceeds maximum size of ${config.maxFileSizeBytes} bytes`); err.status = 413; throw err; }
  if (db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, fullPath)) {
    const err = new Error('A file or folder with that name already exists'); err.status = 409; throw err;
  }
  const parent = db.prepare('SELECT id, is_dir FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, parentP);
  if (!parent || !parent.is_dir) { const err = new Error('Parent directory not found'); err.status = 404; throw err; }
  enforceQuota(userId, size);
  const id = uid('fil');
  const mime = mimeFromName(clean);
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO files (id, user_id, parent_id, name, path, is_dir, mime_type, size, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'), datetime('now'))`).run(id, userId, parent.id, clean, fullPath, mime, size, body);
    updateStorageUsed(userId, size);
  });
  tx();
  return getNodeByPath(userId, fullPath);
}

export function readFile(userId, path) {
  const db = getDb();
  const p = normalizePath(path);
  const row = db.prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, p);
  if (!row) { const err = new Error('File not found'); err.status = 404; throw err; }
  if (row.is_dir) { const err = new Error('Cannot read a directory as a file'); err.status = 400; throw err; }
  return { ...rowToNode(row), content: row.content ?? (row.content_blob ? row.content_blob.toString('utf8') : '') };
}

export function writeFile(userId, path, content) {
  const db = getDb();
  const p = normalizePath(path);
  const row = db.prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, p);
  if (!row) { const err = new Error('File not found'); err.status = 404; throw err; }
  if (row.is_dir) { const err = new Error('Cannot write to a directory'); err.status = 400; throw err; }
  const body = typeof content === 'string' ? content : String(content || '');
  const size = Buffer.byteLength(body, 'utf8');
  if (size > config.maxFileSizeBytes) { const err = new Error(`File exceeds maximum size of ${config.maxFileSizeBytes} bytes`); err.status = 413; throw err; }
  const delta = size - (row.size || 0);
  if (delta > 0) enforceQuota(userId, delta);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE files SET content = ?, size = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?`).run(body, size, row.id);
    if (delta !== 0) updateStorageUsed(userId, delta);
  });
  tx();
  return readFile(userId, p);
}

export function renameNode(userId, path, newName) {
  const db = getDb();
  const p = normalizePath(path);
  const clean = safeName(newName);
  const row = db.prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, p);
  if (!row) { const err = new Error('Not found'); err.status = 404; throw err; }
  if (p === '/Home' || p === '/Trash') { const err = new Error('Cannot rename system folders'); err.status = 403; throw err; }
  const parent = parentPath(p);
  const newPath = parent === '/' ? `/${clean}` : `${parent}/${clean}`;
  if (newPath === p) return rowToNode(row);
  if (db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, newPath)) {
    const err = new Error('Name already exists'); err.status = 409; throw err;
  }
  const tx = db.transaction(() => {
    if (row.is_dir) {
      const descendants = db.prepare(`SELECT id, path FROM files WHERE user_id = ? AND path LIKE ?`).all(userId, p + '/%');
      const updatePath = db.prepare(`UPDATE files SET path = ?, updated_at = datetime('now') WHERE id = ?`);
      for (const d of descendants) updatePath.run(newPath + d.path.slice(p.length), d.id);
    }
    db.prepare(`UPDATE files SET name = ?, path = ?, updated_at = datetime('now') WHERE id = ?`).run(clean, newPath, row.id);
  });
  tx();
  return getNodeByPath(userId, newPath);
}

export function moveNode(userId, path, newParentPath) {
  const db = getDb();
  const p = normalizePath(path);
  const destParent = normalizePath(newParentPath || '/Home');
  const row = db.prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, p);
  if (!row) { const err = new Error('Not found'); err.status = 404; throw err; }
  if (p === '/Home' || p === '/Trash') { const err = new Error('Cannot move system folders'); err.status = 403; throw err; }
  const parentRow = db.prepare('SELECT id, is_dir FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, destParent);
  if (!parentRow || !parentRow.is_dir) { const err = new Error('Destination directory not found'); err.status = 404; throw err; }
  if (row.is_dir && (destParent === p || destParent.startsWith(p + '/'))) {
    const err = new Error('Cannot move a folder into itself'); err.status = 400; throw err;
  }
  const newPath = destParent === '/' ? `/${row.name}` : `${destParent}/${row.name}`;
  if (db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, newPath)) {
    const err = new Error('An item with that name already exists in the destination'); err.status = 409; throw err;
  }
  const tx = db.transaction(() => {
    if (row.is_dir) {
      const descendants = db.prepare(`SELECT id, path FROM files WHERE user_id = ? AND path LIKE ?`).all(userId, p + '/%');
      const updatePath = db.prepare(`UPDATE files SET path = ?, updated_at = datetime('now') WHERE id = ?`);
      for (const d of descendants) updatePath.run(newPath + d.path.slice(p.length), d.id);
    }
    db.prepare(`UPDATE files SET parent_id = ?, path = ?, updated_at = datetime('now') WHERE id = ?`).run(parentRow.id, newPath, row.id);
  });
  tx();
  return getNodeByPath(userId, newPath);
}

export function trashNode(userId, path) {
  const db = getDb();
  const p = normalizePath(path);
  if (p === '/Home' || p === '/Trash') { const err = new Error('Cannot delete system folders'); err.status = 403; throw err; }
  const row = db.prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, p);
  if (!row) { const err = new Error('Not found'); err.status = 404; throw err; }
  // Move to unique trash paths so UNIQUE(user_id, path) does not block recreating the same name
  const trashRoot = db.prepare(`SELECT id FROM files WHERE user_id = ? AND path = '/Trash' AND is_dir = 1`).get(userId);
  const trashParentId = trashRoot?.id || null;
  db.transaction(() => {
    const nodes = db.prepare(`SELECT id, path, name, parent_id FROM files WHERE user_id = ? AND is_trashed = 0 AND (path = ? OR path LIKE ?) ORDER BY path`).all(userId, p, p + '/%');
    const idMap = new Map();
    for (const n of nodes) {
      const relative = n.path === p ? '' : n.path.slice(p.length);
      // Unique path under /Trash using node id to avoid collisions
      const trashPath = n.path === p
        ? `/Trash/${n.id}_${n.name}`
        : `/Trash/${row.id}_${row.name}${relative}`;
      idMap.set(n.id, trashPath);
      const newParent = n.path === p ? trashParentId : (nodes.find((x) => x.path === parentPath(n.path)) ? nodes.find((x) => x.path === parentPath(n.path)).id : trashParentId);
      db.prepare(`UPDATE files SET is_trashed = 1, trashed_at = datetime('now'), original_path = ?, path = ?, parent_id = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(n.path, trashPath, n.path === p ? trashParentId : n.parent_id, n.id);
    }
    // Fix parent_ids for descendants so they remain under the trashed root node
    for (const n of nodes) {
      if (n.path === p) continue;
      const parentOriginal = parentPath(n.path);
      const parentNode = nodes.find((x) => x.path === parentOriginal);
      if (parentNode) {
        db.prepare(`UPDATE files SET parent_id = ? WHERE id = ?`).run(parentNode.id, n.id);
      }
    }
  })();
  return { ok: true, path: p };
}

export function restoreNode(userId, path) {
  const db = getDb();
  const p = normalizePath(path);
  // Accept either the current trash path or the original path
  let row = db.prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 1').get(userId, p);
  if (!row) {
    row = db.prepare('SELECT * FROM files WHERE user_id = ? AND original_path = ? AND is_trashed = 1').get(userId, p);
  }
  if (!row) { const err = new Error('Not found in trash'); err.status = 404; throw err; }

  const targetPath = row.original_path || p;
  if (db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, targetPath)) {
    const err = new Error('A non-trashed item already exists at this path'); err.status = 409; throw err;
  }

  // Ensure parent of target exists (and is live)
  const parent = parentPath(targetPath);
  if (parent && parent !== '/') {
    const parentLive = db.prepare('SELECT id, is_dir FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, parent);
    if (!parentLive || !parentLive.is_dir) {
      const err = new Error('Cannot restore: original parent directory is missing'); err.status = 409; throw err;
    }
  }

  db.transaction(() => {
    // Collect this node and descendants currently under the trash path prefix
    const trashPrefix = row.path;
    const nodes = db.prepare(`SELECT * FROM files WHERE user_id = ? AND is_trashed = 1 AND (path = ? OR path LIKE ?) ORDER BY path`).all(userId, trashPrefix, trashPrefix + '/%');
    for (const n of nodes) {
      const orig = n.original_path;
      if (!orig) continue;
      let parentId = null;
      const pp = parentPath(orig);
      if (pp && pp !== '/') {
        const pr = db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, pp)
          || db.prepare('SELECT id FROM files WHERE user_id = ? AND original_path = ?').get(userId, pp);
        parentId = pr?.id || null;
      } else if (pp === '/') {
        parentId = null;
      }
      // For root of restore, reattach to live parent of original path
      if (n.id === row.id && parent && parent !== '/') {
        const pr = db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, parent);
        parentId = pr?.id || null;
      }
      db.prepare(`UPDATE files SET is_trashed = 0, trashed_at = NULL, path = ?, original_path = NULL, parent_id = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(orig, parentId, n.id);
    }
  })();
  return getNodeByPath(userId, targetPath);
}

export function permanentlyDelete(userId, path) {
  const db = getDb();
  const p = normalizePath(path);
  if (p === '/Home' || p === '/Trash') { const err = new Error('Cannot permanently delete system folders'); err.status = 403; throw err; }
  // Resolve by live path, trash path, or original_path
  let root = db.prepare('SELECT * FROM files WHERE user_id = ? AND path = ?').get(userId, p);
  if (!root) {
    root = db.prepare('SELECT * FROM files WHERE user_id = ? AND original_path = ?').get(userId, p);
  }
  if (!root) { const err = new Error('Not found'); err.status = 404; throw err; }
  const prefix = root.path;
  const rows = db.prepare(`SELECT id, size FROM files WHERE user_id = ? AND (path = ? OR path LIKE ?)`).all(userId, prefix, prefix + '/%');
  if (!rows.length) { const err = new Error('Not found'); err.status = 404; throw err; }
  let freed = 0; for (const r of rows) freed += r.size || 0;
  db.transaction(() => {
    db.prepare(`DELETE FROM files WHERE user_id = ? AND (path = ? OR path LIKE ?)`).run(userId, prefix, prefix + '/%');
    if (freed) updateStorageUsed(userId, -freed);
  })();
  return { ok: true, freed };
}

export function copyNode(userId, path, destParentPath, newName = null) {
  const db = getDb();
  const p = normalizePath(path);
  const destParent = normalizePath(destParentPath || '/Home');
  const src = db.prepare('SELECT * FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, p);
  if (!src) { const err = new Error('Source not found'); err.status = 404; throw err; }
  const parentRow = db.prepare('SELECT id, is_dir FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, destParent);
  if (!parentRow || !parentRow.is_dir) { const err = new Error('Destination directory not found'); err.status = 404; throw err; }
  const targetName = safeName(newName || src.name);
  const newPath = destParent === '/' ? `/${targetName}` : `${destParent}/${targetName}`;
  if (db.prepare('SELECT id FROM files WHERE user_id = ? AND path = ? AND is_trashed = 0').get(userId, newPath)) {
    const err = new Error('An item with that name already exists in the destination'); err.status = 409; throw err;
  }
  const toCopy = [src];
  if (src.is_dir) {
    toCopy.push(...db.prepare('SELECT * FROM files WHERE user_id = ? AND path LIKE ? AND is_trashed = 0 ORDER BY path').all(userId, p + '/%'));
  }
  let totalSize = 0; for (const n of toCopy) totalSize += n.size || 0;
  enforceQuota(userId, totalSize);
  const idMap = new Map();
  db.transaction(() => {
    for (const n of toCopy) {
      const relative = n.path === p ? '' : n.path.slice(p.length);
      const destPath = newPath + relative;
      const newId = uid('fil');
      idMap.set(n.id, newId);
      const newParentId = n.id === src.id ? parentRow.id : (idMap.get(n.parent_id) || parentRow.id);
      db.prepare(`INSERT INTO files (id, user_id, parent_id, name, path, is_dir, mime_type, size, content, content_blob, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`)
        .run(newId, userId, newParentId, n.id === src.id ? targetName : n.name, destPath, n.is_dir, n.mime_type, n.size || 0, n.content, n.content_blob);
    }
    if (totalSize) updateStorageUsed(userId, totalSize);
  })();
  return getNodeByPath(userId, newPath);
}

export function searchFiles(userId, query, limit = 50) {
  const db = getDb();
  const q = `%${String(query || '').trim()}%`;
  if (q === '%%') return [];
  return db.prepare(`SELECT id, name, path, is_dir, mime_type, size, created_at, updated_at FROM files WHERE user_id = ? AND is_trashed = 0 AND (name LIKE ? OR path LIKE ?) ORDER BY is_dir DESC, name COLLATE NOCASE LIMIT ?`)
    .all(userId, q, q, Math.min(limit, 100)).map(rowToNode);
}

export function getTree(userId, root = '/Home') {
  const db = getDb();
  const p = normalizePath(root);
  return db.prepare(`SELECT id, name, path, is_dir, mime_type, size, parent_id, created_at, updated_at FROM files WHERE user_id = ? AND is_trashed = 0 AND (path = ? OR path LIKE ?) ORDER BY path`)
    .all(userId, p, p + '/%').map(rowToNode);
}

export function getStorageStats(userId) {
  const db = getDb();
  const user = db.prepare('SELECT storage_used FROM users WHERE id = ?').get(userId);
  const count = db.prepare('SELECT COUNT(*) as c FROM files WHERE user_id = ? AND is_trashed = 0').get(userId);
  return { used: user?.storage_used || 0, limit: config.maxStorageBytes, files: count?.c || 0, maxFiles: config.maxFilesPerUser };
}

function enforceQuota(userId, additionalBytes) {
  const db = getDb();
  const user = db.prepare('SELECT storage_used FROM users WHERE id = ?').get(userId);
  if ((user?.storage_used || 0) + additionalBytes > config.maxStorageBytes) {
    const err = new Error('Storage quota exceeded'); err.status = 413; throw err;
  }
  const count = db.prepare('SELECT COUNT(*) as c FROM files WHERE user_id = ? AND is_trashed = 0').get(userId);
  if ((count?.c || 0) >= config.maxFilesPerUser) {
    const err = new Error('Maximum number of files reached'); err.status = 413; throw err;
  }
}

function updateStorageUsed(userId, delta) {
  getDb().prepare(`UPDATE users SET storage_used = MAX(0, storage_used + ?), updated_at = datetime('now') WHERE id = ?`).run(delta, userId);
}

export function exportTreeAsClientFormat(userId) {
  return getTree(userId, '/').map((n) => ({
    id: n.id, name: n.name, type: n.isDir ? 'folder' : 'file',
    parent: parentPath(n.path) || null, path: n.path, size: n.size, mime: n.mimeType, modified: n.updatedAt,
  }));
}

export function listTrash(userId) {
  const db = getDb();
  const all = db.prepare(`SELECT id, name, path, original_path, is_dir, mime_type, size, trashed_at, parent_id, created_at, updated_at FROM files WHERE user_id = ? AND is_trashed = 1 ORDER BY trashed_at DESC`).all(userId);
  const trashedIds = new Set(all.map((r) => r.id));
  return all.filter((r) => !r.parent_id || !trashedIds.has(r.parent_id)).map((r) => {
    const node = rowToNode(r);
    // Present original path to clients so restore(path) works with familiar paths
    if (r.original_path) node.path = r.original_path;
    node.trashPath = r.path;
    return node;
  });
}
