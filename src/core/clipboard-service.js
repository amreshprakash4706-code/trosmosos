/**
 * Trosmos OS 4.0 — Clipboard Abstraction
 * Uses Clipboard API where available; maintains internal history for OS clipboard app.
 * Never pretends to access arbitrary browser clipboard history.
 */

import { eventBus } from './event-bus.js';

const MAX_HISTORY = 30;

export class ClipboardService {
  constructor(storage) {
    this.storage = storage;
    /** Internal history of items copied *through* Trosmos */
    this._history = [];
  }

  async init() {
    try {
      const rec = await this.storage?.get?.('clipboard', 'history');
      if (rec?.data && Array.isArray(rec.data)) {
        this._history = rec.data.slice(0, MAX_HISTORY);
      }
    } catch (_) {}
  }

  /**
   * Copy text via OS (and browser clipboard if permitted).
   */
  async writeText(text, meta = {}) {
    if (typeof text !== 'string') text = String(text ?? '');
    const item = {
      id: `cb_${Date.now()}`,
      text,
      ts: Date.now(),
      source: meta.source || 'system',
      preview: text.slice(0, 120)
    };

    // Try browser clipboard
    let browserOk = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        browserOk = true;
      }
    } catch (err) {
      // Permission denied or insecure context — still keep internal history
      console.warn('[Clipboard] Browser write failed, using internal history only', err.message);
    }

    this._history.unshift(item);
    if (this._history.length > MAX_HISTORY) this._history.length = MAX_HISTORY;
    await this._persist();
    eventBus.emit('clipboard:changed', { item, browserOk });
    return { ok: true, browserOk, item };
  }

  /**
   * Read current browser clipboard (requires user gesture + permission).
   * Falls back to most recent internal item.
   */
  async readText() {
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        return { text, source: 'browser' };
      }
    } catch (err) {
      console.warn('[Clipboard] Browser read failed', err.message);
    }
    if (this._history.length) {
      return { text: this._history[0].text, source: 'history' };
    }
    return { text: '', source: 'empty' };
  }

  history() {
    return this._history.map(h => ({
      id: h.id,
      preview: h.preview,
      ts: h.ts,
      source: h.source,
      length: h.text?.length ?? 0
    }));
  }

  getItem(id) {
    return this._history.find(h => h.id === id) || null;
  }

  async clearHistory() {
    this._history = [];
    await this._persist();
    eventBus.emit('clipboard:changed', { cleared: true });
  }

  async _persist() {
    try {
      // Store limited history (cap text size)
      const data = this._history.map(h => ({
        ...h,
        text: (h.text || '').slice(0, 10000)
      }));
      await this.storage?.put?.('clipboard', { id: 'history', data });
    } catch (_) {}
  }
}

export default ClipboardService;
