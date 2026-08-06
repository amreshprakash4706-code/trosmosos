/**
 * Trosmos OS 4.0 — System Monitor
 * Real browser-appropriate metrics only. No fabricated CPU/RAM.
 */

import { eventBus } from './event-bus.js';
import { networkService } from './network-service.js';

export class SystemMonitor {
  constructor() {
    this._startTime = Date.now();
  }

  getMetrics() {
    const mem = performance.memory || null;
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    const paint = performance.getEntriesByType?.('paint') || [];

    return {
      uptimeMs: Date.now() - this._startTime,
      timestamp: Date.now(),
      apps: {
        registered: window.__TrosmosAppRegistry?.list?.()?.length ?? null,
        running: this._countRunningApps()
      },
      windows: {
        open: document.querySelectorAll('.window:not(.minimized)').length,
        minimized: document.querySelectorAll('.window.minimized').length,
        total: document.querySelectorAll('.window').length
      },
      memory: mem ? {
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
        note: 'Chrome-only performance.memory; not available in all browsers'
      } : {
        available: false,
        note: 'Browser does not expose memory metrics'
      },
      storage: null, // filled async
      network: networkService.getInfo(),
      performance: {
        domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
        loadEvent: nav?.loadEventEnd ?? null,
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime ?? null,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime ?? null
      },
      serviceWorker: this._swState(),
      indexedDB: typeof indexedDB !== 'undefined'
    };
  }

  async getStorageEstimate() {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        return {
          usage: est.usage ?? null,
          quota: est.quota ?? null,
          usagePercent: est.quota ? Math.round((est.usage / est.quota) * 1000) / 10 : null
        };
      }
    } catch (_) {}
    return { available: false, note: 'Storage estimate API not available' };
  }

  _countRunningApps() {
    try {
      const reg = window.__TrosmosAppRegistry;
      if (!reg) return null;
      return reg.list().filter(a => reg.state(a.id) === 'running').length;
    } catch {
      return null;
    }
  }

  _swState() {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const ctrl = navigator.serviceWorker.controller;
    return {
      supported: true,
      controlled: !!ctrl,
      scriptURL: ctrl?.scriptURL || null
    };
  }

  async fullReport() {
    const metrics = this.getMetrics();
    metrics.storage = await this.getStorageEstimate();
    return metrics;
  }
}

export const systemMonitor = new SystemMonitor();
export default systemMonitor;

if (typeof window !== 'undefined') {
  window.__TrosmosMonitor = systemMonitor;
}
