/**
 * Trosmos OS — AI Permission Manager
 * Destructive or sensitive tools require explicit user confirmation.
 * Safe tools can be auto-allowed when configured.
 */

import { eventBus } from './event-bus.js';

const DESTRUCTIVE = new Set(['DELETE', 'SYSTEM']);
const SENSITIVE = new Set(['WRITE', 'MOVE']);

export class PermissionManager {
  constructor(storage) {
    this.storage = storage;
    this.trusted = new Set(['READ', 'EXECUTE']); // default trusted levels
    this.sessionAllow = new Set(); // session-level grants
    this._pending = null;
  }

  async init() {
    const rec = await this.storage.get('permissions', 'prefs');
    if (rec?.data?.trusted) {
      this.trusted = new Set(rec.data.trusted);
    }
  }

  /**
   * Request permission for a tool.
   * Returns true if allowed, false if denied.
   */
  async request(toolName, level, args = {}) {
    // Always allow trusted levels
    if (this.trusted.has(level) || this.sessionAllow.has(`${toolName}:${level}`)) {
      return true;
    }

    // Destructive / sensitive → UI confirmation
    const needsConfirm = DESTRUCTIVE.has(level) || SENSITIVE.has(level);
    if (!needsConfirm) return true;

    return new Promise((resolve) => {
      this._pending = { toolName, level, args, resolve };
      eventBus.emit('permission:request', {
        toolName,
        level,
        args,
        message: this._humanMessage(toolName, level, args)
      });
    });
  }

  /** Called by UI when user accepts or declines */
  respond(allowed, remember = false) {
    if (!this._pending) return;
    const { toolName, level, resolve } = this._pending;
    this._pending = null;
    if (allowed && remember) {
      this.sessionAllow.add(`${toolName}:${level}`);
    }
    resolve(!!allowed);
    eventBus.emit('permission:resolved', { allowed });
  }

  _humanMessage(tool, level, args) {
    const path = args.path || args.name || args.parent || '';
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
}

export default PermissionManager;
