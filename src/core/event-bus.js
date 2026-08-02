/**
 * Trosmos OS — Lightweight Event Bus
 * Decoupled, leak-safe communication between core services and UI.
 */

class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, handler) {
    if (typeof handler !== 'function') return () => {};
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    const wrap = (...args) => {
      this.off(event, wrap);
      try {
        handler(...args);
      } catch (err) {
        console.error(`[Trosmos EventBus] once("${event}")`, err);
      }
    };
    return this.on(event, wrap);
  }

  off(event, handler) {
    const set = this._listeners.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this._listeners.delete(event);
  }

  emit(event, data) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[Trosmos EventBus] Error in handler for "${event}":`, err);
      }
    }
  }

  clear(event) {
    if (event) this._listeners.delete(event);
    else this._listeners.clear();
  }

  listenerCount(event) {
    return this._listeners.get(event)?.size ?? 0;
  }
}

export const eventBus = new EventBus();
export default eventBus;
