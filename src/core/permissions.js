/**
 * Trosmos OS — AI Permission Manager
 * Destructive or sensitive tools require explicit user confirmation.
 * Uses event bus so UI can render a proper modal instead of window.confirm.
 */

import { eventBus } from './event-bus.js';

const DESTRUCTIVE = new Set(['DELETE', 'SYSTEM']);
const SENSITIVE = new Set(['WRITE', 'MOVE']);

export class PermissionManager {
  constructor(storage) {
    this.storage = storage;
    this.trusted = new Set(['READ', 'EXECUTE']);
    this.sessionAllow = new Set();
    this._pending = null;
    this._queue = [];
  }

  async init() {
    try {
      const rec = await this.storage.get('permissions', 'prefs');
      if (rec?.data?.trusted && Array.isArray(rec.data.trusted)) {
        this.trusted = new Set(rec.data.trusted);
      }
    } catch {
      /* keep defaults */
    }
  }

  async request(toolName, level, args = {}) {
    if (this.trusted.has(level) || this.sessionAllow.has(`${toolName}:${level}`)) {
      return true;
    }

    const needsConfirm = DESTRUCTIVE.has(level) || SENSITIVE.has(level);
    if (!needsConfirm) return true;

    return new Promise((resolve) => {
      const entry = { toolName, level, args, resolve };
      if (this._pending) {
        this._queue.push(entry);
        return;
      }
      this._show(entry);
    });
  }

  _show(entry) {
    this._pending = entry;
    eventBus.emit('permission:request', {
      toolName: entry.toolName,
      level: entry.level,
      args: entry.args,
      message: this._humanMessage(entry.toolName, entry.level, entry.args)
    });
  }

  respond(allowed, remember = false) {
    if (!this._pending) return;
    const { toolName, level, resolve } = this._pending;
    this._pending = null;
    if (allowed && remember) {
      this.sessionAllow.add(`${toolName}:${level}`);
    }
    resolve(!!allowed);
    eventBus.emit('permission:resolved', { allowed: !!allowed });

    if (this._queue.length) {
      const next = this._queue.shift();
      setTimeout(() => this._show(next), 60);
    }
  }

  _humanMessage(tool, level, args) {
    const path = args.path || args.name || args.parent || args.newParent || '';
    switch (level) {
      case 'DELETE':
        return `Allow Trosmos AI to permanently delete "${path}"?`;
      case 'WRITE':
        return `Allow Trosmos AI to create or modify files (${tool})?`;
      case 'MOVE':
        return `Allow Trosmos AI to move or rename "${path}"?`;
      case 'SYSTEM':
        return `Allow Trosmos AI to change system settings?`;
      default:
        return `Allow Trosmos AI to perform "${tool}"?`;
    }
  }

  async setTrusted(levels) {
    this.trusted = new Set(levels);
    await this.storage.put('permissions', {
      id: 'prefs',
      data: { trusted: [...this.trusted] }
    });
  }

  cancelAll() {
    if (this._pending) {
      this._pending.resolve(false);
      this._pending = null;
    }
    while (this._queue.length) {
      this._queue.shift().resolve(false);
    }
  }
}

export default PermissionManager;
