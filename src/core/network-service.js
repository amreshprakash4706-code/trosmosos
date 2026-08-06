/**
 * Trosmos OS 4.0 — Network Service
 * Centralized online/offline/degraded detection.
 */

import { eventBus } from './event-bus.js';

export class NetworkService {
  constructor() {
    this.status = navigator.onLine ? 'online' : 'offline';
    this._listenersBound = false;
  }

  init() {
    if (this._listenersBound) return;
    this._listenersBound = true;

    window.addEventListener('online', () => this._set('online'));
    window.addEventListener('offline', () => this._set('offline'));

    // Optional: Connection API
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      const update = () => {
        if (!navigator.onLine) {
          this._set('offline');
          return;
        }
        if (conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') {
          this._set('degraded');
        } else {
          this._set('online');
        }
      };
      conn.addEventListener('change', update);
      update();
    }
  }

  _set(status) {
    if (this.status === status) return;
    const prev = this.status;
    this.status = status;
    eventBus.emit('network:changed', { status, prev });
  }

  isOnline() {
    return this.status === 'online' || this.status === 'degraded';
  }

  getInfo() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      status: this.status,
      online: navigator.onLine,
      effectiveType: conn?.effectiveType || null,
      downlink: conn?.downlink ?? null,
      rtt: conn?.rtt ?? null,
      saveData: conn?.saveData ?? null
    };
  }
}

export const networkService = new NetworkService();
export default networkService;

if (typeof window !== 'undefined') {
  window.__TrosmosNetwork = networkService;
}
