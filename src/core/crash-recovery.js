/**
 * Trosmos OS 4.0 — Crash Recovery
 * Isolate app failures; preserve shell state; offer restart.
 */

import { eventBus } from './event-bus.js';

export class CrashRecovery {
  constructor() {
    this._failures = new Map(); // appId -> count
    this._shellErrors = [];
  }

  init() {
    window.addEventListener('error', (ev) => {
      this._handleGlobal(ev.error || ev.message, ev.filename);
    });
    window.addEventListener('unhandledrejection', (ev) => {
      this._handleGlobal(ev.reason, 'promise');
    });

    eventBus.on('app:failed', ({ id, error }) => {
      this.recordAppFailure(id, error);
    });
  }

  _handleGlobal(error, source) {
    const msg = String(error?.message || error || 'Unknown error');
    this._shellErrors.push({ msg, source, ts: Date.now() });
    if (this._shellErrors.length > 50) this._shellErrors.shift();
    eventBus.emit('system:error', { source: source || 'global', error: msg });
    // Do NOT reload the entire page
  }

  recordAppFailure(appId, error) {
    const count = (this._failures.get(appId) || 0) + 1;
    this._failures.set(appId, count);
    console.error(`[CrashRecovery] App ${appId} failed (${count}x):`, error);

    if (count >= 3) {
      eventBus.emit('system:error', {
        source: 'crash-recovery',
        error: `App ${appId} failed repeatedly`,
        appId
      });
    }
  }

  /**
   * Attempt to restart a failed app safely.
   */
  async restartApp(appId) {
    const reg = window.__TrosmosAppRegistry;
    if (!reg) return false;
    try {
      await reg.close(appId);
    } catch (_) {}
    this._failures.set(appId, 0);
    return reg.launch(appId);
  }

  getFailures() {
    return Object.fromEntries(this._failures);
  }

  getShellErrors() {
    return [...this._shellErrors];
  }
}

export const crashRecovery = new CrashRecovery();
export default crashRecovery;

if (typeof window !== 'undefined') {
  window.__TrosmosCrash = crashRecovery;
}
