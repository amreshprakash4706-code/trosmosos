/**
 * Trosmos OS 4.0 — Application Registry & Plugin Architecture
 * Extensible registration for apps with metadata, capabilities,
 * permissions, commands, file associations, shortcuts, and lifecycle.
 */

import { eventBus } from './event-bus.js';

/** @typedef {'registered'|'launching'|'running'|'suspended'|'closing'|'closed'|'failed'} AppLifecycleState */

/**
 * @typedef {Object} AppDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} [icon]
 * @property {string} [version]
 * @property {string} [category]
 * @property {string[]} [capabilities]
 * @property {string[]} [permissions]
 * @property {boolean} [singleton]
 * @property {string} [windowId]
 * @property {string} [color]
 * @property {Function} [launch]
 * @property {Function} [onClose]
 * @property {Function} [onSuspend]
 * @property {Function} [onResume]
 * @property {Object[]} [commands]
 * @property {Object[]} [shortcuts]
 * @property {string[]} [fileTypes]
 * @property {string[]} [deepLinks]
 * @property {Object} [settings]
 * @property {string} [storageNamespace]
 */

export class AppRegistry {
  constructor() {
    /** @type {Map<string, AppDefinition>} */
    this._apps = new Map();
    /** @type {Map<string, AppLifecycleState>} */
    this._states = new Map();
    /** @type {Map<string, object>} */
    this._instances = new Map();
    this._fileHandlers = new Map(); // ext -> appId[]
    this._deepLinkHandlers = new Map();
  }

  /**
   * Register an application. Safe to call multiple times (idempotent for same id).
   * @param {AppDefinition} def
   */
  register(def) {
    if (!def || !def.id || !def.name) {
      console.warn('[AppRegistry] Invalid app definition', def);
      return false;
    }
    if (this._apps.has(def.id)) {
      // Allow update of metadata but preserve state
      const existing = this._apps.get(def.id);
      this._apps.set(def.id, { ...existing, ...def });
    } else {
      this._apps.set(def.id, {
        version: '1.0.0',
        singleton: true,
        capabilities: [],
        permissions: [],
        commands: [],
        shortcuts: [],
        fileTypes: [],
        deepLinks: [],
        ...def
      });
      this._states.set(def.id, 'registered');
    }

    const app = this._apps.get(def.id);
    if (app.fileTypes) {
      for (const ext of app.fileTypes) {
        const key = ext.toLowerCase().replace(/^\./, '');
        if (!this._fileHandlers.has(key)) this._fileHandlers.set(key, []);
        const list = this._fileHandlers.get(key);
        if (!list.includes(app.id)) list.push(app.id);
      }
    }
    if (app.deepLinks) {
      for (const link of app.deepLinks) {
        this._deepLinkHandlers.set(link, app.id);
      }
    }

    eventBus.emit('app:registered', { id: app.id, name: app.name });
    return true;
  }

  unregister(id) {
    this._apps.delete(id);
    this._states.delete(id);
    this._instances.delete(id);
  }

  get(id) {
    return this._apps.get(id) || null;
  }

  list(filter = {}) {
    let apps = [...this._apps.values()];
    if (filter.category) apps = apps.filter(a => a.category === filter.category);
    if (filter.capability) apps = apps.filter(a => a.capabilities?.includes(filter.capability));
    return apps;
  }

  state(id) {
    return this._states.get(id) || 'closed';
  }

  setState(id, state) {
    const prev = this._states.get(id);
    this._states.set(id, state);
    if (prev !== state) {
      eventBus.emit(`app:${state === 'running' ? 'opened' : state}`, { id, prev });
    }
  }

  /**
   * Launch an application with proper lifecycle.
   * One broken app must not take down the shell.
   */
  async launch(id, opts = {}) {
    const app = this._apps.get(id);
    if (!app) {
      console.warn('[AppRegistry] Unknown app:', id);
      return false;
    }

    const current = this.state(id);
    if (app.singleton && (current === 'running' || current === 'launching')) {
      // Focus existing
      if (typeof app.focus === 'function') {
        try { app.focus(); } catch (e) { console.error('[AppRegistry] focus', e); }
      } else if (app.windowId && window.Trosmos?.windows?.focusOrOpen) {
        window.Trosmos.windows.focusOrOpen(app.windowId);
      }
      return true;
    }

    this.setState(id, 'launching');
    eventBus.emit('app:launching', { id });

    try {
      if (typeof app.launch === 'function') {
        await app.launch(opts);
      } else if (app.windowId && window.Trosmos?.windows?.focusOrOpen) {
        window.Trosmos.windows.focusOrOpen(app.windowId);
      } else {
        throw new Error('No launch handler');
      }
      this.setState(id, 'running');
      this._instances.set(id, { launchedAt: Date.now(), opts });
      return true;
    } catch (err) {
      console.error(`[AppRegistry] Failed to launch ${id}:`, err);
      this.setState(id, 'failed');
      eventBus.emit('app:failed', { id, error: String(err) });
      return false;
    }
  }

  async close(id) {
    const app = this._apps.get(id);
    if (!app) return false;
    this.setState(id, 'closing');
    try {
      if (typeof app.onClose === 'function') await app.onClose();
      if (app.windowId && window.Trosmos?.windows?.close) {
        window.Trosmos.windows.close(app.windowId);
      }
      this.setState(id, 'closed');
      this._instances.delete(id);
      return true;
    } catch (err) {
      console.error(`[AppRegistry] close ${id}:`, err);
      this.setState(id, 'failed');
      return false;
    }
  }

  suspend(id) {
    const app = this._apps.get(id);
    if (!app) return;
    try {
      if (typeof app.onSuspend === 'function') app.onSuspend();
      this.setState(id, 'suspended');
    } catch (e) {
      console.error('[AppRegistry] suspend', e);
    }
  }

  resume(id) {
    const app = this._apps.get(id);
    if (!app) return;
    try {
      if (typeof app.onResume === 'function') app.onResume();
      this.setState(id, 'running');
    } catch (e) {
      console.error('[AppRegistry] resume', e);
    }
  }

  /** Resolve which app handles a file extension */
  handlerForFile(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const ids = this._fileHandlers.get(ext) || [];
    return ids.map(id => this._apps.get(id)).filter(Boolean);
  }

  /** Resolve deep link */
  handlerForDeepLink(link) {
    const id = this._deepLinkHandlers.get(link);
    return id ? this._apps.get(id) : null;
  }

  search(query) {
    if (!query) return this.list();
    const q = query.toLowerCase().trim();
    return this.list().filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      (a.category || '').toLowerCase().includes(q) ||
      (a.keywords || []).some(k => k.toLowerCase().includes(q))
    );
  }
}

export const appRegistry = new AppRegistry();
export default appRegistry;

if (typeof window !== 'undefined') {
  window.__TrosmosAppRegistry = appRegistry;
}
