/**
 * Trosmos OS 4.0 — Session Architecture
 * Lock screen, session state, recovery — no fake auth.
 */

import { eventBus } from './event-bus.js';

export class SessionManager {
  constructor(storage) {
    this.storage = storage;
    this.locked = false;
    this.username = 'aria';
    this._idleTimer = null;
    this._idleMs = 10 * 60 * 1000; // 10 min default
    this._lastActivity = Date.now();
  }

  async init() {
    try {
      const prefs = await this.storage?.get?.('settings', 'prefs');
      if (prefs?.data?.username) this.username = prefs.data.username;
      if (prefs?.data?.idleLockMinutes) {
        this._idleMs = Math.max(1, prefs.data.idleLockMinutes) * 60 * 1000;
      }
    } catch (_) {}

    // Restore lock state only if user had locked (not on every refresh)
    try {
      const sess = await this.storage?.get?.('session', 'state');
      if (sess?.data?.locked) {
        this.lock();
      }
    } catch (_) {}

    this._bindActivity();
  }

  _bindActivity() {
    const bump = () => {
      this._lastActivity = Date.now();
      this._resetIdle();
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
      window.addEventListener(ev, bump, { passive: true });
    });
    this._resetIdle();
  }

  _resetIdle() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    if (this.locked) return;
    this._idleTimer = setTimeout(() => this.lock(), this._idleMs);
  }

  lock() {
    if (this.locked) return;
    this.locked = true;
    eventBus.emit('session:locked', { username: this.username });
    const lockEl = document.getElementById('lock-screen');
    if (lockEl) {
      lockEl.classList.remove('hidden');
      lockEl.style.display = '';
    }
    this._persist({ locked: true });
  }

  unlock() {
    if (!this.locked) return;
    this.locked = false;
    eventBus.emit('session:unlocked', { username: this.username });
    const lockEl = document.getElementById('lock-screen');
    if (lockEl) {
      lockEl.classList.add('hidden');
      lockEl.style.display = 'none';
    }
    this._lastActivity = Date.now();
    this._resetIdle();
    this._persist({ locked: false });
  }

  async _persist(data) {
    try {
      await this.storage?.put?.('session', { id: 'state', data: { ...data, updatedAt: Date.now() } });
    } catch (_) {}
  }
}

export default SessionManager;
