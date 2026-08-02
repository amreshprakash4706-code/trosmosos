/**
 * Trosmos OS — Virtual File System
 * Persistent, hierarchical, path-safe CRUD.
 * Default structure is seeded only when empty (never wipes existing data).
 */

import { eventBus } from '../core/event-bus.js';

const DEFAULT_SEED = [
  { path: '/Home', name: 'Home', type: 'folder', parent: '/', mime: null, size: 0, modified: Date.now() },
  { path: '/Home/Documents', name: 'Documents', type: 'folder', parent: '/Home', mime: null, size: 0, modified: Date.now() },
  { path: '/Home/Downloads', name: 'Downloads', type: 'folder', parent: '/Home', mime: null, size: 0, modified: Date.now() },
  { path: '/Home/Pictures', name: 'Pictures', type: 'folder', parent: '/Home', mime: null, size: 0, modified: Date.now() },
  { path: '/Home/Projects', name: 'Projects', type: 'folder', parent: '/Home', mime: null, size: 0, modified: Date.now() },
  {
    path: '/Home/Documents/Welcome.md',
    name: 'Welcome.md',
    type: 'file',
    parent: '/Home/Documents',
    mime: 'text/markdown',
    size: 420,
    modified: Date.now(),
    content: '# Welcome to Trosmos OS\n\nYour AI-native operating system is ready.\n\n- Ask the AI to create notes, folders, or open apps\n- Files persist across sessions\n- Press Ctrl+K for the command palette\n'
  }
];

/** Normalize and sanitize virtual paths. Prevents traversal / empty segments. */
export function normalizePath(input) {
  if (input == null || typeof input !== 'string') return '/Home';
  let p = input.replace(/\\/g, '/').trim();
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/+/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  const parts = p.split('/').filter((seg) => seg && seg !== '.' && seg !== '..');
  return '/' + parts.join('/');
}

function isValidName(name) {
  if (!name || typeof name !== 'string') return false;
  const n = name.trim();
  if (!n || n === '.' || n === '..') return false;
  if (/[\\/:*?"<>|\x00-\x1f]/.test(n)) return false;
  if (n.length > 180) return false;
  return true;
}

export class VirtualFileSystem {
  constructor(storage) {
    this.storage = storage;
    this.cache = [];
    this.ready = false;
    this._persistTimer = null;
  }

  async init() {
    try {
      const record = await this.storage.get('filesystem', 'files');
      if (record && Array.isArray(record.data) && record.data.length > 0) {
        this.cache = this._sanitizeCache(record.data);
        this._repairParents();
      } else {
        this.cache = structuredClone(DEFAULT_SEED);
        await this._persist();
      }
    } catch (err) {
      console.error('[Trosmos VFS] init failed, seeding defaults', err);
      this.cache = structuredClone(DEFAULT_SEED);
    }
    this.ready = true;
    eventBus.emit('fs:ready', { count: this.cache.length });
  }

  _sanitizeCache(items) {
    const seen = new Set();
    const out = [];
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const path = normalizePath(raw.path);
      if (!path || path === '/' || seen.has(path)) continue;
      if (!isValidName(raw.name) && raw.name !== 'Home') continue;
      seen.add(path);
      out.push({
        path,
        name: String(raw.name || path.split('/').pop()),
        type: raw.type === 'folder' ? 'folder' : 'file',
        parent: normalizePath(raw.parent || path.split('/').slice(0, -1).join('/') || '/'),
        mime: raw.mime || (raw.type === 'file' ? 'text/plain' : null),
        size: typeof raw.size === 'number' ? raw.size : (raw.content ? String(raw.content).length : 0),
        modified: typeof raw.modified === 'number' ? raw.modified : Date.now(),
        content: raw.type === 'file' ? (raw.content ?? '') : undefined
      });
    }
    return out;
  }

  _repairParents() {
    let changed = false;
    for (const item of this.cache) {
      const expectedParent = item.path === '/Home' ? '/' : item.path.split('/').slice(0, -1).join('/') || '/';
      if (item.parent !== expectedParent) {
        item.parent = expectedParent;
        changed = true;
      }
    }
    if (changed) this._schedulePersist();
  }

  _schedulePersist() {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this._persist().catch((e) => console.warn('[Trosmos VFS] persist failed', e));
    }, 80);
  }

  async _persist() {
    await this.storage.put('filesystem', { id: 'files', data: this.cache });
  }

  list(parentPath = '/Home') {
    const parent = normalizePath(parentPath);
    return this.cache
      .filter((f) => f.parent === parent)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
  }

  getFile(path) {
    const p = normalizePath(path);
    return this.cache.find((f) => f.path === p) || null;
  }

  exists(path) {
    return this.cache.some((f) => f.path === normalizePath(path));
  }

  search(term) {
    if (!term || typeof term !== 'string') return [];
    const q = term.toLowerCase().trim();
    if (!q) return [];
    return this.cache.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (typeof f.content === 'string' && f.content.toLowerCase().includes(q))
    );
  }

  async createFolder(parentPath, name) {
    if (!isValidName(name)) return null;
    const parent = normalizePath(parentPath);
    if (parent !== '/' && !this.exists(parent)) return null;
    const path = normalizePath(`${parent}/${name}`);
    if (this.exists(path)) return null;
    const folder = {
      path,
      name: name.trim(),
      type: 'folder',
      parent,
      mime: null,
      size: 0,
      modified: Date.now()
    };
    this.cache.push(folder);
    await this._persist();
    eventBus.emit('fs:change', { action: 'createFolder', path });
    return folder;
  }

  async createFile(parentPath, name, content = '', mime = 'text/plain') {
    if (!isValidName(name)) return null;
    const parent = normalizePath(parentPath);
    if (parent !== '/' && !this.exists(parent)) return null;
    const path = normalizePath(`${parent}/${name}`);
    const existing = this.getFile(path);
    const text = content == null ? '' : String(content);
    if (existing) {
      if (existing.type !== 'file') return null;
      existing.content = text;
      existing.modified = Date.now();
      existing.size = text.length;
      existing.mime = mime || existing.mime;
      await this._persist();
      eventBus.emit('fs:change', { action: 'write', path });
      return existing;
    }
    const file = {
      path,
      name: name.trim(),
      type: 'file',
      parent,
      mime: mime || 'text/plain',
      size: text.length,
      modified: Date.now(),
      content: text
    };
    this.cache.push(file);
    await this._persist();
    eventBus.emit('fs:change', { action: 'createFile', path });
    return file;
  }

  async writeFile(path, content) {
    const file = this.getFile(path);
    if (!file || file.type !== 'file') return null;
    const text = content == null ? '' : String(content);
    file.content = text;
    file.size = text.length;
    file.modified = Date.now();
    await this._persist();
    eventBus.emit('fs:change', { action: 'write', path: file.path });
    return file;
  }

  async readFile(path) {
    const file = this.getFile(path);
    if (!file || file.type !== 'file') return null;
    return file.content ?? '';
  }

  async delete(path) {
    const p = normalizePath(path);
    if (p === '/Home' || p === '/') return false;
    const before = this.cache.length;
    this.cache = this.cache.filter((f) => f.path !== p && !f.path.startsWith(p + '/'));
    if (this.cache.length === before) return false;
    await this._persist();
    eventBus.emit('fs:change', { action: 'delete', path: p });
    return true;
  }

  async rename(oldPath, newName) {
    if (!isValidName(newName)) return null;
    const item = this.getFile(oldPath);
    if (!item || item.path === '/Home') return null;
    const parent = item.parent;
    const newPath = normalizePath(`${parent}/${newName}`);
    if (this.exists(newPath)) return null;

    const old = item.path;
    item.path = newPath;
    item.name = newName.trim();
    item.modified = Date.now();

    if (item.type === 'folder') {
      for (const f of this.cache) {
        if (f.path.startsWith(old + '/')) {
          f.path = f.path.replace(old, newPath);
          if (f.parent === old) f.parent = newPath;
          else if (f.parent.startsWith(old + '/')) f.parent = f.parent.replace(old, newPath);
        }
      }
    }

    await this._persist();
    eventBus.emit('fs:change', { action: 'rename', oldPath: old, newPath });
    return item;
  }

  async move(oldPath, newParent) {
    const item = this.getFile(oldPath);
    if (!item || item.path === '/Home') return null;
    const destParent = normalizePath(newParent);
    if (destParent !== '/' && !this.exists(destParent)) return null;
    if (item.type === 'folder' && (destParent === item.path || destParent.startsWith(item.path + '/'))) {
      return null;
    }
    const newPath = normalizePath(`${destParent}/${item.name}`);
    if (this.exists(newPath)) return null;

    const old = item.path;
    item.path = newPath;
    item.parent = destParent;
    item.modified = Date.now();

    if (item.type === 'folder') {
      for (const f of this.cache) {
        if (f.path.startsWith(old + '/')) {
          f.path = f.path.replace(old, newPath);
          if (f.parent === old) f.parent = newPath;
          else if (f.parent.startsWith(old + '/')) f.parent = f.parent.replace(old, newPath);
        }
      }
    }

    await this._persist();
    eventBus.emit('fs:change', { action: 'move', oldPath: old, newPath });
    return item;
  }

  metadata(path) {
    const f = this.getFile(path);
    if (!f) return null;
    return {
      path: f.path,
      name: f.name,
      type: f.type,
      size: f.size,
      modified: f.modified,
      mime: f.mime
    };
  }

  breadcrumbs(path) {
    const p = normalizePath(path);
    const parts = p.split('/').filter(Boolean);
    const crumbs = [{ name: 'Home', path: '/Home' }];
    let acc = '/Home';
    for (let i = 1; i < parts.length; i++) {
      acc = `${acc}/${parts[i]}`;
      crumbs.push({ name: parts[i], path: acc });
    }
    return crumbs;
  }
}

export default VirtualFileSystem;
