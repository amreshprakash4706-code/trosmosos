/**
 * Trosmos OS — Lightweight Event Bus
 * Applications and core services communicate through controlled events.
 */

class EventBus {
  constructor() {
    this._listeners = new Map();
    this._once = new Map();
  }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    const wrap = (...args) => {
      this.off(event, wrap);
      handler(...args);
    };
    return this.on(event, wrap);
  }

  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) set.delete(handler);
  }

  emit(event, data) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    // Copy to avoid mutation during iteration
    [...set].forEach(handler => {
      try {
        handler(data);
      } catch (err) {
        console.error(`[Trosmos EventBus] Error in handler for "${event}":`, err);
      }
    });
  }

  clear(event) {
    if (event) this._listeners.delete(event);
    else this._listeners.clear();
  }
}

export const eventBus = new EventBus();
export default eventBus;
