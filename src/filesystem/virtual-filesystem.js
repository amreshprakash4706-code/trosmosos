/**
 * Trosmos OS — Virtual File System
 * Persistent, hierarchical, with clean CRUD APIs.
 * Default structure is created only when empty (no data wipe on upgrade).
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

export class VirtualFileSystem {
  constructor(storage) {
    this.storage = storage;
    this.cache = [];
    this.ready = false;
  }

  async init() {
    const record = await this.storage.get('filesystem', 'files');
    if (record && Array.isArray(record.data) && record.data.length > 0) {
      this.cache = record.data;
    } else {
      // First boot or empty — seed clean structure (never overwrite existing)
      this.cache = structuredClone(DEFAULT_SEED);
      await this._persist();
    }
    this.ready = true;
    eventBus.emit('fs:ready', { count: this.cache.length });
  }

  async _persist() {
    await this.storage.put('filesystem', { id: 'files', data: this.cache });
  }

  list(parentPath = '/Home') {
    return this.cache
      .filter(f => f.parent === parentPath)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  getFile(path) {
    return this.cache.find(f => f.path === path) || null;
  }

  exists(path) {
    return this.cache.some(f => f.path === path);
  }

  search(term) {
    const q = term.toLowerCase();
    return this.cache.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.content && f.content.toLowerCase().includes(q))
    );
  }

  async createFolder(parentPath, name) {
    const path = `${parentPath}/${name}`.replace(/\/+/g, '/');
    if (this.exists(path)) return null;
    const folder = {
      path,
      name,
      type: 'folder',
      parent: parentPath,
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
    const path = `${parentPath}/${name}`.replace(/\/+/g, '/');
    const existing = this.getFile(path);
    if (existing) {
      existing.content = content;
      existing.modified = Date.now();
      existing.size = content.length;
      await this._persist();
      eventBus.emit('fs:change', { action: 'write', path });
      return existing;
    }
    const file = {
      path,
      name,
      type: 'file',
      parent: parentPath,
      mime,
      size: content.length,
      modified: Date.now(),
      content
    };
    this.cache.push(file);
    await this._persist();
    eventBus.emit('fs:change', { action: 'createFile', path });
    return file;
  }

  async writeFile(path, content) {
    const file = this.getFile(path);
    if (!file || file.type !== 'file') return null;
    file.content = content;
    file.size = content.length;
    file.modified = Date.now();
    await this._persist();
    eventBus.emit('fs:change', { action: 'write', path });
    return file;
  }

  async readFile(path) {
    const file = this.getFile(path);
    if (!file || file.type !== 'file') return null;
    return file.content;
  }

  async delete(path) {
    const before = this.cache.length;
    this.cache = this.cache.filter(f => f.path !== path && !f.path.startsWith(path + '/'));
    if (this.cache.length === before) return false;
    await this._persist();
    eventBus.emit('fs:change', { action: 'delete', path });
    return true;
  }

  async rename(oldPath, newName) {
    const item = this.getFile(oldPath);
    if (!item) return null;
    const parent = item.parent;
    const newPath = `${parent}/${newName}`.replace(/\/+/g, '/');
    if (this.exists(newPath)) return null;

    item.path = newPath;
    item.name = newName;
    item.modified = Date.now();

    if (item.type === 'folder') {
      this.cache.forEach(f => {
        if (f.path.startsWith(oldPath + '/')) {
          f.path = f.path.replace(oldPath, newPath);
          if (f.parent === oldPath) f.parent = newPath;
        }
      });
    }

    await this._persist();
    eventBus.emit('fs:change', { action: 'rename', oldPath, newPath });
    return item;
  }

  async move(oldPath, newParent) {
    const item = this.getFile(oldPath);
    if (!item) return null;
    const newPath = `${newParent}/${item.name}`.replace(/\/+/g, '/');
    if (this.exists(newPath)) return null;

    const old = oldPath;
    item.path = newPath;
    item.parent = newParent;
    item.modified = Date.now();

    if (item.type === 'folder') {
      this.cache.forEach(f => {
        if (f.path.startsWith(old + '/')) {
          f.path = f.path.replace(old, newPath);
          if (f.parent === old) f.parent = newPath;
        }
      });
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
}

export default VirtualFileSystem;
