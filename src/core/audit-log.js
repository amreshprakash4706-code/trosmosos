/**
 * Trosmos OS 4.0 — Audit Log
 * Records important operations without logging sensitive content.
 */

import { eventBus } from './event-bus.js';

const MAX_ENTRIES = 500;

export class AuditLog {
  constructor(storage) {
    this.storage = storage;
    this._entries = [];
    this._loaded = false;
  }

  async init() {
    try {
      const rec = await this.storage?.get?.('audit', 'log');
      if (rec?.data && Array.isArray(rec.data)) {
        this._entries = rec.data.slice(-MAX_ENTRIES);
      }
    } catch (_) {}
    this._loaded = true;

    // Auto-record key system events
    const auto = [
      'app:opened', 'app:closed', 'app:failed',
      'permission:granted', 'permission:denied',
      'file:created', 'file:deleted', 'file:restored',
      'ai:tool-request', 'ai:tool-result',
      'system:error', 'session:locked', 'session:unlocked'
    ];
    for (const ev of auto) {
      eventBus.on(ev, (data) => this.record(ev, this._sanitize(data)));
    }
  }

  _sanitize(data) {
    if (!data || typeof data !== 'object') return data;
    const out = { ...data };
    // Never store file contents or private text
    delete out.content;
    delete out.body;
    delete out.text;
    delete out.password;
    delete out.token;
    if (out.args && typeof out.args === 'object') {
      out.args = { ...out.args };
      delete out.args.content;
      delete out.args.text;
    }
    return out;
  }

  record(type, data = {}) {
    const entry = {
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      data: this._sanitize(data),
      ts: Date.now()
    };
    this._entries.push(entry);
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(-MAX_ENTRIES);
    }
    eventBus.emit('audit:event', entry);
    this._persist();
    return entry;
  }

  recent(limit = 50, typeFilter) {
    let list = this._entries;
    if (typeFilter) list = list.filter(e => e.type === typeFilter || e.type.startsWith(typeFilter));
    return list.slice(-limit).reverse();
  }

  clear() {
    this._entries = [];
    this._persist();
  }

  async _persist() {
    try {
      await this.storage?.put?.('audit', { id: 'log', data: this._entries.slice(-MAX_ENTRIES) });
    } catch (_) {}
  }
}

export default AuditLog;
