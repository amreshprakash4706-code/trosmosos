/**
 * Trosmos OS 4.0 — System Event Bus
 * Controlled, leak-safe pub/sub for OS events.
 * Applications must not emit privileged system events.
 */

const SYSTEM_EVENTS = new Set([
  'app:registered', 'app:launching', 'app:opened', 'app:suspended', 'app:closing', 'app:closed', 'app:failed',
  'window:created', 'window:focused', 'window:minimized', 'window:maximized', 'window:restored',
  'window:closed', 'window:moved', 'window:resized', 'window:snapped',
  'workspace:changed', 'workspace:created',
  'file:created', 'file:changed', 'file:deleted', 'file:restored', 'file:moved', 'file:renamed',
  'settings:changed', 'theme:changed',
  'network:changed', 'storage:error', 'system:error', 'system:ready',
  'permission:requested', 'permission:granted', 'permission:denied',
  'command:executed', 'notification:shown', 'notification:dismissed',
  'ai:tool-request', 'ai:tool-result', 'ai:error',
  'session:locked', 'session:unlocked', 'session:recovered',
  'clipboard:changed', 'search:indexed', 'audit:event'
]);

class EventBus {
  constructor() {
    this._listeners = new Map();
    this._history = [];
    this._maxHistory = 200;
    this._paused = false;
  }

  on(event, handler, options = {}) {
    if (typeof handler !== 'function') return () => {};
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    const entry = { handler, once: !!options.once, priority: options.priority || 0 };
    this._listeners.get(event).add(entry);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    return this.on(event, handler, { once: true });
  }

  off(event, handler) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const entry of set) {
      if (entry.handler === handler) {
        set.delete(entry);
        break;
      }
    }
    if (set.size === 0) this._listeners.delete(event);
  }

  emit(event, data) {
    if (this._paused) return;
    const set = this._listeners.get(event);
    const record = { event, data, ts: Date.now() };
    this._history.push(record);
    if (this._history.length > this._maxHistory) this._history.shift();

    if (!set || set.size === 0) return;
    const ordered = [...set].sort((a, b) => b.priority - a.priority);
    for (const entry of ordered) {
      try {
        entry.handler(data);
      } catch (err) {
        console.error(`[Trosmos EventBus] Error in "${event}":`, err);
        try {
          this._emitRaw('system:error', { source: 'event-bus', event, error: String(err) });
        } catch (_) { /* prevent recursion */ }
      }
      if (entry.once) set.delete(entry);
    }
  }

  _emitRaw(event, data) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const entry of [...set]) {
      try { entry.handler(data); } catch (_) {}
    }
  }

  pause() { this._paused = true; }
  resume() { this._paused = false; }

  clear(event) {
    if (event) this._listeners.delete(event);
    else this._listeners.clear();
  }

  listenerCount(event) {
    return this._listeners.get(event)?.size ?? 0;
  }

  recent(limit = 50) {
    return this._history.slice(-limit);
  }

  isSystemEvent(name) {
    return SYSTEM_EVENTS.has(name);
  }
}

export const eventBus = new EventBus();
export default eventBus;

if (typeof window !== 'undefined') {
  window.__TrosmosEventBus = eventBus;
}
