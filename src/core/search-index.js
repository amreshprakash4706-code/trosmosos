/**
 * Trosmos OS 4.0 — Universal Search Index
 * Indexes apps, files, notes, settings, commands, recent items.
 * Non-blocking incremental updates.
 */

import { eventBus } from './event-bus.js';

export class SearchIndex {
  constructor() {
    this._docs = new Map(); // id -> { type, title, body, keywords, score, meta }
    this._pending = false;
    this._queue = [];
  }

  /**
   * @param {object} doc
   * @param {string} doc.id
   * @param {string} doc.type - app|file|note|setting|command|recent
   * @param {string} doc.title
   * @param {string} [doc.body]
   * @param {string} [doc.keywords]
   * @param {number} [doc.boost]
   * @param {object} [doc.meta]
   */
  add(doc) {
    if (!doc?.id) return;
    this._docs.set(doc.id, {
      type: 'file',
      title: '',
      body: '',
      keywords: '',
      boost: 1,
      meta: {},
      ...doc,
      indexedAt: Date.now()
    });
  }

  remove(id) {
    this._docs.delete(id);
  }

  clear(type) {
    if (!type) {
      this._docs.clear();
      return;
    }
    for (const [id, doc] of this._docs) {
      if (doc.type === type) this._docs.delete(id);
    }
  }

  /**
   * Ranked search. Does not block UI.
   */
  search(query, opts = {}) {
    const limit = opts.limit || 40;
    const types = opts.types || null;
    if (!query || !query.trim()) {
      let all = [...this._docs.values()];
      if (types) all = all.filter(d => types.includes(d.type));
      return all.slice(0, limit).map(d => ({ ...d, score: d.boost || 1 }));
    }

    const tokens = query.toLowerCase().trim().split(/\s+/);
    const results = [];

    for (const doc of this._docs.values()) {
      if (types && !types.includes(doc.type)) continue;
      const hay = `${doc.title} ${doc.body} ${doc.keywords} ${doc.type}`.toLowerCase();
      let score = 0;
      let match = true;
      for (const t of tokens) {
        if (!hay.includes(t)) { match = false; break; }
        score += t.length;
        if (doc.title.toLowerCase().includes(t)) score += 8;
        if (doc.title.toLowerCase().startsWith(t)) score += 12;
        if (doc.title.toLowerCase() === query.toLowerCase().trim()) score += 30;
      }
      if (match) {
        score *= (doc.boost || 1);
        // Type priority: apps > commands > files > settings
        const typeBoost = { app: 1.5, command: 1.3, recent: 1.4, note: 1.2, setting: 1.1, file: 1.0 };
        score *= typeBoost[doc.type] || 1;
        results.push({ ...doc, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /** Incremental reindex helper — call from event handlers */
  scheduleReindex(fn) {
    this._queue.push(fn);
    if (this._pending) return;
    this._pending = true;
    // Yield to UI
    setTimeout(() => {
      try {
        while (this._queue.length) {
          const job = this._queue.shift();
          job();
        }
        eventBus.emit('search:indexed', { count: this._docs.size });
      } finally {
        this._pending = false;
      }
    }, 0);
  }

  size() {
    return this._docs.size;
  }
}

export const searchIndex = new SearchIndex();
export default searchIndex;

if (typeof window !== 'undefined') {
  window.__TrosmosSearch = searchIndex;
}
