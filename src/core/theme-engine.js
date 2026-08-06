/**
 * Trosmos OS 4.0 — Theme Engine
 * light | dark | system + CSS custom properties.
 */

import { eventBus } from './event-bus.js';

const THEMES = {
  dark: {
    '--bg-primary': '#09090B',
    '--bg-secondary': '#18181B',
    '--bg-elevated': 'rgba(24, 24, 27, 0.85)',
    '--text-primary': '#FAFAFA',
    '--text-secondary': 'rgba(255,255,255,0.6)',
    '--text-muted': 'rgba(255,255,255,0.4)',
    '--border-subtle': 'rgba(255,255,255,0.08)',
    '--accent': '#3B82F6',
    '--accent-secondary': '#7C3AED',
    '--glass-bg': 'rgba(24, 24, 27, 0.7)',
    '--glass-border': 'rgba(255,255,255,0.1)',
    '--danger': '#EF4444',
    '--success': '#10B981',
    '--warning': '#F59E0B'
  },
  light: {
    '--bg-primary': '#F4F4F5',
    '--bg-secondary': '#FFFFFF',
    '--bg-elevated': 'rgba(255, 255, 255, 0.9)',
    '--text-primary': '#18181B',
    '--text-secondary': 'rgba(0,0,0,0.6)',
    '--text-muted': 'rgba(0,0,0,0.4)',
    '--border-subtle': 'rgba(0,0,0,0.08)',
    '--accent': '#2563EB',
    '--accent-secondary': '#7C3AED',
    '--glass-bg': 'rgba(255, 255, 255, 0.75)',
    '--glass-border': 'rgba(0,0,0,0.08)',
    '--danger': '#DC2626',
    '--success': '#059669',
    '--warning': '#D97706'
  }
};

export class ThemeEngine {
  constructor(storage) {
    this.storage = storage;
    this.mode = 'dark'; // light | dark | system
    this._mq = null;
  }

  async init() {
    try {
      const prefs = await this.storage?.get?.('settings', 'prefs');
      if (prefs?.data?.theme) this.mode = prefs.data.theme;
      if (prefs?.data?.accentColor) {
        this.setAccent(prefs.data.accentColor);
      }
    } catch (_) {}

    this._mq = window.matchMedia('(prefers-color-scheme: dark)');
    this._mq.addEventListener?.('change', () => {
      if (this.mode === 'system') this._apply();
    });
    this._apply();
  }

  async setMode(mode) {
    if (!['light', 'dark', 'system'].includes(mode)) return;
    this.mode = mode;
    this._apply();
    eventBus.emit('theme:changed', { mode });
    try {
      const prefs = await this.storage?.get?.('settings', 'prefs');
      const data = { ...(prefs?.data || {}), theme: mode };
      await this.storage?.put?.('settings', { id: 'prefs', data });
    } catch (_) {}
  }

  setAccent(color) {
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--trosmos-accent', color);
  }

  _resolve() {
    if (this.mode === 'system') {
      return this._mq?.matches ? 'dark' : 'light';
    }
    return this.mode;
  }

  _apply() {
    const resolved = this._resolve();
    const vars = THEMES[resolved] || THEMES.dark;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v);
    }
    root.setAttribute('data-theme', resolved);
    root.classList.toggle('theme-light', resolved === 'light');
    root.classList.toggle('theme-dark', resolved === 'dark');
  }

  getMode() { return this.mode; }
  getResolved() { return this._resolve(); }
}

export default ThemeEngine;
