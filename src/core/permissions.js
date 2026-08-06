/**
 * Trosmos OS 4.0 — Centralized Capability / Permission System
 * Applications request capabilities; the OS controls access.
 * AI tools never auto-gain elevated privileges.
 */

import { eventBus } from './event-bus.js';

export const CAPABILITIES = Object.freeze({
  'filesystem.read':   { level: 'READ',    description: 'Read files and folders' },
  'filesystem.write':  { level: 'WRITE',   description: 'Create, modify, or delete files' },
  'filesystem.delete': { level: 'DELETE',  description: 'Permanently delete or trash files' },
  'clipboard.read':    { level: 'READ',    description: 'Read clipboard contents' },
  'clipboard.write':   { level: 'WRITE',   description: 'Write to clipboard' },
  'network':           { level: 'NETWORK', description: 'Make network requests' },
  'notifications':     { level: 'EXECUTE', description: 'Show system notifications' },
  'ai':                { level: 'AI',      description: 'Use AI agent features' },
  'external-navigation': { level: 'NETWORK', description: 'Open external URLs' },
  'settings.write':    { level: 'SYSTEM',  description: 'Change system settings' },
  'process.manage':    { level: 'SYSTEM',  description: 'Manage other processes' },
  'window.manage':     { level: 'EXECUTE', description: 'Control windows' }
});

const DESTRUCTIVE = new Set(['DELETE', 'SYSTEM']);
const SENSITIVE = new Set(['WRITE', 'MOVE', 'AI']);

export class PermissionManager {
  constructor(storage) {
    this.storage = storage;
    this.trusted = new Set(['READ', 'EXECUTE', 'NETWORK']);
    this.sessionAllow = new Set();
    this.appGrants = new Map(); // appId -> Set of capability keys
    this._queue = [];
    this._pending = null;
  }

  async init() {
    try {
      const rec = await this.storage?.get?.('permissions', 'prefs');
      if (rec?.data?.trusted && Array.isArray(rec.data.trusted)) {
        this.trusted = new Set(rec.data.trusted);
      }
      if (rec?.data?.appGrants) {
        for (const [appId, caps] of Object.entries(rec.data.appGrants)) {
          this.appGrants.set(appId, new Set(caps));
        }
      }
    } catch {
      /* keep defaults */
    }
  }

  /**
   * Request a capability for an app or tool.
   * @param {string} capability - e.g. 'filesystem.write'
   * @param {object} opts - { appId, toolName, args, reason }
   * @returns {Promise<boolean>}
   */
  async request(capability, opts = {}) {
    const meta = CAPABILITIES[capability];
    const level = meta?.level || 'SYSTEM';
    const key = `${opts.appId || opts.toolName || 'system'}:${capability}`;

    if (this.trusted.has(level) || this.sessionAllow.has(key)) {
      eventBus.emit('permission:granted', { capability, ...opts, auto: true });
      return true;
    }

    if (opts.appId && this.appGrants.get(opts.appId)?.has(capability)) {
      eventBus.emit('permission:granted', { capability, ...opts, auto: true });
      return true;
    }

    const needsConfirm = DESTRUCTIVE.has(level) || SENSITIVE.has(level);
    if (!needsConfirm) {
      eventBus.emit('permission:granted', { capability, ...opts, auto: true });
      return true;
    }

    eventBus.emit('permission:requested', { capability, level, ...opts });

    return new Promise((resolve) => {
      const request = {
        capability,
        level,
        description: meta?.description || capability,
        toolName: opts.toolName,
        appId: opts.appId,
        args: opts.args,
        reason: opts.reason,
        resolve: (decision) => {
          if (decision === 'session') {
            this.sessionAllow.add(key);
            eventBus.emit('permission:granted', { capability, ...opts, session: true });
            resolve(true);
          } else if (decision === 'once') {
            eventBus.emit('permission:granted', { capability, ...opts, once: true });
            resolve(true);
          } else {
            eventBus.emit('permission:denied', { capability, ...opts });
            resolve(false);
          }
        }
      };
      this._queue.push(request);
      this._processQueue();
    });
  }

  /** Legacy API used by AI tools */
  async requestTool(toolName, level, args = {}) {
    const capMap = {
      READ: 'filesystem.read',
      WRITE: 'filesystem.write',
      DELETE: 'filesystem.delete',
      SYSTEM: 'settings.write',
      EXECUTE: 'window.manage',
      NETWORK: 'network',
      AI: 'ai'
    };
    return this.request(capMap[level] || 'settings.write', { toolName, args, level });
  }

  _processQueue() {
    if (this._pending || this._queue.length === 0) return;
    this._pending = this._queue.shift();
    eventBus.emit('permission:show-ui', this._pending);
  }

  respond(decision) {
    if (!this._pending) return;
    const req = this._pending;
    this._pending = null;
    req.resolve(decision);
    this._processQueue();
  }

  grantApp(appId, capabilities) {
    if (!this.appGrants.has(appId)) this.appGrants.set(appId, new Set());
    for (const c of capabilities) this.appGrants.get(appId).add(c);
    this._persist();
  }

  revokeApp(appId, capability) {
    this.appGrants.get(appId)?.delete(capability);
    this._persist();
  }

  has(appId, capability) {
    if (this.trusted.has(CAPABILITIES[capability]?.level)) return true;
    return this.appGrants.get(appId)?.has(capability) || false;
  }

  async _persist() {
    try {
      const appGrants = {};
      for (const [k, v] of this.appGrants) appGrants[k] = [...v];
      await this.storage?.put?.('permissions', {
        id: 'prefs',
        data: { trusted: [...this.trusted], appGrants }
      });
    } catch (_) {}
  }
}

export default PermissionManager;
