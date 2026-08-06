/**
 * Trosmos OS 4.0 — Deep Link Handler
 * Validates URL parameters; never executes arbitrary code from URLs.
 */

import { eventBus } from './event-bus.js';

const ALLOWED_APPS = new Set([
  'ai', 'ai-assistant', 'files', 'file-manager', 'settings', 'terminal',
  'calculator', 'notes', 'clock', 'clipboard', 'browser', 'task-manager',
  'app-store', 'help', 'monitor'
]);

export class DeepLinkHandler {
  constructor(appRegistry) {
    this.appRegistry = appRegistry;
  }

  /**
   * Parse and handle current URL search params.
   * Supported: ?app=files  ?app=terminal  ?file=/Home/Documents/x.txt
   */
  handle(search = window.location.search) {
    try {
      const params = new URLSearchParams(search);
      const app = params.get('app');
      const file = params.get('file');

      if (app) {
        const safe = this._sanitizeApp(app);
        if (safe) {
          // Defer until OS ready
          const launch = () => {
            const reg = this.appRegistry || window.__TrosmosAppRegistry;
            if (reg?.launch) {
              reg.launch(safe);
            } else {
              // Fallback to legacy openers
              this._legacyOpen(safe);
            }
          };
          if (window.Trosmos?.vfs) launch();
          else eventBus.once('system:ready', launch);
        }
      }

      if (file) {
        const safePath = this._sanitizePath(file);
        if (safePath) {
          const openFile = () => {
            const handlers = this.appRegistry?.handlerForFile?.(safePath) || [];
            if (handlers.length && handlers[0].launch) {
              handlers[0].launch({ file: safePath });
            } else if (window.Trosmos?.desktop?.openTextEditor) {
              const f = window.Trosmos.vfs?.getFile?.(safePath);
              if (f) window.Trosmos.desktop.openTextEditor(f);
            }
          };
          if (window.Trosmos?.vfs) openFile();
          else eventBus.once('system:ready', openFile);
        }
      }
    } catch (err) {
      console.warn('[DeepLinks] Invalid URL params', err);
    }
  }

  _sanitizeApp(app) {
    if (typeof app !== 'string') return null;
    const id = app.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    // Map short names
    const aliases = {
      ai: 'ai-assistant',
      files: 'file-manager',
      file: 'file-manager',
      calc: 'calculator',
      tasks: 'task-manager'
    };
    const resolved = aliases[id] || id;
    return ALLOWED_APPS.has(resolved) || ALLOWED_APPS.has(id) ? (aliases[id] || id) : null;
  }

  _sanitizePath(path) {
    if (typeof path !== 'string') return null;
    // Only allow absolute virtual paths under /Home
    let p = path.trim().replace(/\\/g, '/');
    if (!p.startsWith('/')) p = '/' + p;
    // Prevent traversal
    if (p.includes('..') || p.includes('\0')) return null;
    if (!p.startsWith('/Home') && p !== '/Home') {
      // Allow only /Home tree
      if (p === '/') return null;
    }
    // Limit length
    if (p.length > 512) return null;
    return p;
  }

  _legacyOpen(id) {
    const map = {
      'ai-assistant': () => window.openAIAssistant?.(),
      'file-manager': () => window.openFileManager?.(),
      settings: () => window.openSettings?.(),
      terminal: () => window.openTerminal?.(),
      calculator: () => window.openCalculator?.(),
      notes: () => window.openNotes?.(),
      clock: () => window.openClock?.(),
      clipboard: () => window.openClipboard?.(),
      browser: () => window.openBrowser?.(),
      'task-manager': () => window.openTaskManager?.(),
      'app-store': () => window.openAppStore?.(),
      help: () => window.openHelp?.()
    };
    map[id]?.();
  }
}

export default DeepLinkHandler;
