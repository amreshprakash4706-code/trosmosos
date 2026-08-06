/**
 * Trosmos OS 4.0 — Trash / Recovery System
 * Delete → Trash → Restore / Permanently Delete
 */

import { eventBus } from '../core/event-bus.js';

export class TrashService {
  constructor(storage, vfs) {
    this.storage = storage;
    this.vfs = vfs;
    this._items = [];
  }

  async init() {
    try {
      const rec = await this.storage.get('trash', 'items');
      if (rec?.data && Array.isArray(rec.data)) {
        this._items = rec.data;
      }
    } catch (_) {}
  }

  list() {
    return [...this._items].sort((a, b) => b.deletedAt - a.deletedAt);
  }

  /**
   * Move path(s) to trash instead of permanent delete.
   */
  async softDelete(path) {
    if (!path || path === '/' || path === '/Home') {
      return { ok: false, error: 'Cannot trash system root' };
    }

    const files = this.vfs?.cache?.get('files') || [];
    const toTrash = files.filter(f => f.path === path || f.path.startsWith(path + '/'));
    if (!toTrash.length) return { ok: false, error: 'Not found' };

    const entry = {
      id: `trash_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      originalPath: path,
      items: JSON.parse(JSON.stringify(toTrash)),
      deletedAt: Date.now()
    };

    // Remove from VFS
    const remaining = files.filter(f => !toTrash.includes(f));
    this.vfs.cache.set('files', remaining);
    await this.storage.put('filesystem', { id: 'files', data: remaining });

    this._items.push(entry);
    await this._persist();
    eventBus.emit('file:deleted', { path, trashId: entry.id });
    return { ok: true, trashId: entry.id };
  }

  async restore(trashId) {
    const idx = this._items.findIndex(t => t.id === trashId);
    if (idx < 0) return { ok: false, error: 'Trash item not found' };

    const entry = this._items[idx];
    const files = this.vfs.cache.get('files') || [];

    // Conflict check
    for (const item of entry.items) {
      if (files.some(f => f.path === item.path)) {
        // Rename with suffix
        const base = item.name;
        const parent = item.parent;
        let n = 1;
        let newName = base;
        while (files.some(f => f.path === `${parent}/${newName}`)) {
          const dot = base.lastIndexOf('.');
          if (dot > 0 && item.type === 'file') {
            newName = `${base.slice(0, dot)} (restored ${n})${base.slice(dot)}`;
          } else {
            newName = `${base} (restored ${n})`;
          }
          n++;
        }
        item.name = newName;
        item.path = `${parent}/${newName}`.replace('//', '/');
      }
      files.push(item);
    }

    this.vfs.cache.set('files', files);
    await this.storage.put('filesystem', { id: 'files', data: files });

    this._items.splice(idx, 1);
    await this._persist();
    eventBus.emit('file:restored', { path: entry.originalPath, trashId });
    return { ok: true };
  }

  async permanentDelete(trashId) {
    const idx = this._items.findIndex(t => t.id === trashId);
    if (idx < 0) return { ok: false, error: 'Not found' };
    this._items.splice(idx, 1);
    await this._persist();
    return { ok: true };
  }

  async empty() {
    this._items = [];
    await this._persist();
    return { ok: true };
  }

  async _persist() {
    await this.storage.put('trash', { id: 'items', data: this._items });
  }
}

export default TrashService;
