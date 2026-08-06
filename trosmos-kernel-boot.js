/**
 * Trosmos OS 4.0 — Kernel Boot Bridge
 * Loads modular core and wires it into the existing shell.
 * Safe to load after the main index.html script initializes Trosmos.
 */
(function () {
  'use strict';

  const VERSION = '4.0.0';

  // Inline minimal event bus if module system unavailable (file:// or no bundler)
  function createInlineEventBus() {
    const listeners = new Map();
    const history = [];
    return {
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return () => listeners.get(event)?.delete(handler);
      },
      once(event, handler) {
        const wrap = (d) => { this.off(event, wrap); handler(d); };
        return this.on(event, wrap);
      },
      off(event, handler) { listeners.get(event)?.delete(handler); },
      emit(event, data) {
        history.push({ event, data, ts: Date.now() });
        if (history.length > 200) history.shift();
        const set = listeners.get(event);
        if (!set) return;
        for (const h of [...set]) {
          try { h(data); } catch (e) { console.error('[EventBus]', event, e); }
        }
      },
      recent(n = 50) { return history.slice(-n); }
    };
  }

  // Lightweight App Registry (inline for non-module contexts)
  function createAppRegistry(bus) {
    const apps = new Map();
    const states = new Map();
    return {
      register(def) {
        if (!def?.id) return false;
        apps.set(def.id, { version: '1.0.0', singleton: true, capabilities: [], ...def });
        if (!states.has(def.id)) states.set(def.id, 'registered');
        bus.emit('app:registered', { id: def.id });
        return true;
      },
      get: (id) => apps.get(id) || null,
      list: () => [...apps.values()],
      state: (id) => states.get(id) || 'closed',
      setState(id, s) { states.set(id, s); bus.emit('app:' + (s === 'running' ? 'opened' : s), { id }); },
      async launch(id, opts) {
        const app = apps.get(id);
        if (!app) return false;
        const st = states.get(id);
        if (app.singleton && (st === 'running' || st === 'launching')) {
          if (app.windowId && window.Trosmos?.windows?.focusOrOpen) {
            window.Trosmos.windows.focusOrOpen(app.windowId);
          } else if (typeof app.focus === 'function') app.focus();
          return true;
        }
        states.set(id, 'launching');
        bus.emit('app:launching', { id });
        try {
          if (typeof app.launch === 'function') await app.launch(opts);
          else if (app.windowId && window.Trosmos?.windows?.focusOrOpen) {
            window.Trosmos.windows.focusOrOpen(app.windowId);
          }
          states.set(id, 'running');
          bus.emit('app:opened', { id });
          return true;
        } catch (e) {
          console.error('[AppRegistry] launch', id, e);
          states.set(id, 'failed');
          bus.emit('app:failed', { id, error: String(e) });
          return false;
        }
      },
      async close(id) {
        const app = apps.get(id);
        if (!app) return false;
        states.set(id, 'closing');
        try {
          if (typeof app.onClose === 'function') await app.onClose();
          if (app.windowId && window.Trosmos?.windows?.close) window.Trosmos.windows.close(app.windowId);
          states.set(id, 'closed');
          bus.emit('app:closed', { id });
          return true;
        } catch (e) {
          states.set(id, 'failed');
          return false;
        }
      },
      search(q) {
        if (!q) return this.list();
        const qq = q.toLowerCase();
        return this.list().filter(a =>
          a.name.toLowerCase().includes(qq) || a.id.includes(qq) ||
          (a.keywords || []).some(k => k.toLowerCase().includes(qq))
        );
      },
      handlerForFile(filename) {
        const ext = (filename.split('.').pop() || '').toLowerCase();
        return this.list().filter(a => (a.fileTypes || []).map(t => t.replace(/^\./, '')).includes(ext));
      }
    };
  }

  function createCommandRegistry(bus) {
    const cmds = new Map();
    return {
      register(c) {
        if (!c?.id || typeof c.action !== 'function') return false;
        cmds.set(c.id, c);
        return true;
      },
      list: () => [...cmds.values()],
      get: (id) => cmds.get(id),
      search(query) {
        if (!query?.trim()) return this.list().slice(0, 30);
        const tokens = query.toLowerCase().trim().split(/\s+/);
        const scored = [];
        for (const cmd of cmds.values()) {
          const hay = `${cmd.label} ${cmd.keywords || ''} ${cmd.id}`.toLowerCase();
          let score = 0, ok = true;
          for (const t of tokens) {
            if (!hay.includes(t)) { ok = false; break; }
            score += t.length * 2;
            if (cmd.label.toLowerCase().startsWith(t)) score += 10;
          }
          if (ok) scored.push({ cmd, score });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.map(s => s.cmd);
      },
      async execute(id) {
        const c = cmds.get(id);
        if (!c) return false;
        try {
          await c.action();
          bus.emit('command:executed', { id });
          return true;
        } catch (e) {
          console.error('[Commands]', id, e);
          return false;
        }
      }
    };
  }

  function createSearchIndex() {
    const docs = new Map();
    return {
      add(doc) { if (doc?.id) docs.set(doc.id, { boost: 1, ...doc }); },
      remove(id) { docs.delete(id); },
      clear(type) {
        if (!type) docs.clear();
        else for (const [id, d] of docs) if (d.type === type) docs.delete(id);
      },
      size: () => docs.size,
      search(query, opts = {}) {
        const limit = opts.limit || 40;
        const types = opts.types || null;
        if (!query?.trim()) {
          let all = [...docs.values()];
          if (types) all = all.filter(d => types.includes(d.type));
          return all.slice(0, limit);
        }
        const tokens = query.toLowerCase().trim().split(/\s+/);
        const results = [];
        for (const doc of docs.values()) {
          if (types && !types.includes(doc.type)) continue;
          const hay = `${doc.title} ${doc.body || ''} ${doc.keywords || ''}`.toLowerCase();
          let score = 0, match = true;
          for (const t of tokens) {
            if (!hay.includes(t)) { match = false; break; }
            score += t.length;
            if ((doc.title || '').toLowerCase().includes(t)) score += 8;
            if ((doc.title || '').toLowerCase().startsWith(t)) score += 12;
          }
          if (match) {
            const typeBoost = { app: 1.5, command: 1.3, recent: 1.4, note: 1.2, setting: 1.1, file: 1.0 };
            score *= (doc.boost || 1) * (typeBoost[doc.type] || 1);
            results.push({ ...doc, score });
          }
        }
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, limit);
      },
      scheduleReindex(fn) { setTimeout(fn, 0); }
    };
  }

  function createUndoManager() {
    const undoStack = [], redoStack = [];
    return {
      async execute(cmd) {
        const r = await cmd.do();
        undoStack.push(cmd);
        if (undoStack.length > 50) undoStack.shift();
        redoStack.length = 0;
        return r;
      },
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
      async undo() {
        const c = undoStack.pop();
        if (!c) return false;
        try { await c.undo(); redoStack.push(c); return true; }
        catch (e) { undoStack.push(c); return false; }
      },
      async redo() {
        const c = redoStack.pop();
        if (!c) return false;
        try { await c.do(); undoStack.push(c); return true; }
        catch (e) { redoStack.push(c); return false; }
      }
    };
  }

  function createNetworkService(bus) {
    let status = navigator.onLine ? 'online' : 'offline';
    const set = (s) => {
      if (status === s) return;
      const prev = status;
      status = s;
      bus.emit('network:changed', { status, prev });
    };
    window.addEventListener('online', () => set('online'));
    window.addEventListener('offline', () => set('offline'));
    return {
      get status() { return status; },
      isOnline: () => status === 'online' || status === 'degraded',
      getInfo() {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return {
          status,
          online: navigator.onLine,
          effectiveType: conn?.effectiveType || null,
          downlink: conn?.downlink ?? null,
          rtt: conn?.rtt ?? null,
          saveData: conn?.saveData ?? null
        };
      }
    };
  }

  function createSystemMonitor(network) {
    const start = Date.now();
    return {
      getMetrics() {
        const mem = performance.memory || null;
        return {
          uptimeMs: Date.now() - start,
          windows: {
            open: document.querySelectorAll('.window:not(.minimized)').length,
            minimized: document.querySelectorAll('.window.minimized').length,
            total: document.querySelectorAll('.window').length
          },
          memory: mem ? {
            usedJSHeapSize: mem.usedJSHeapSize,
            totalJSHeapSize: mem.totalJSHeapSize,
            jsHeapSizeLimit: mem.jsHeapSizeLimit,
            note: 'Chrome-only performance.memory'
          } : { available: false, note: 'Browser does not expose memory metrics' },
          network: network.getInfo(),
          serviceWorker: {
            supported: 'serviceWorker' in navigator,
            controlled: !!navigator.serviceWorker?.controller
          },
          indexedDB: typeof indexedDB !== 'undefined'
        };
      },
      async getStorageEstimate() {
        try {
          if (navigator.storage?.estimate) {
            const est = await navigator.storage.estimate();
            return {
              usage: est.usage,
              quota: est.quota,
              usagePercent: est.quota ? Math.round((est.usage / est.quota) * 1000) / 10 : null
            };
          }
        } catch (_) {}
        return { available: false, note: 'Storage estimate API not available' };
      },
      async fullReport() {
        const m = this.getMetrics();
        m.storage = await this.getStorageEstimate();
        return m;
      }
    };
  }

  // Trash service (works with existing VFS cache)
  function createTrash(storage, vfs, bus) {
    let items = [];
    return {
      async init() {
        try {
          const rec = await storage?.get?.('trash', 'items');
          if (rec?.data) items = rec.data;
        } catch (_) {}
      },
      list: () => [...items].sort((a, b) => b.deletedAt - a.deletedAt),
      async softDelete(path) {
        if (!path || path === '/' || path === '/Home') return { ok: false, error: 'Cannot trash root' };
        const files = vfs?.cache?.get('files') || [];
        const toTrash = files.filter(f => f.path === path || f.path.startsWith(path + '/'));
        if (!toTrash.length) return { ok: false, error: 'Not found' };
        const entry = {
          id: 'trash_' + Date.now(),
          originalPath: path,
          items: JSON.parse(JSON.stringify(toTrash)),
          deletedAt: Date.now()
        };
        const remaining = files.filter(f => !toTrash.includes(f));
        vfs.cache.set('files', remaining);
        await storage.put('filesystem', { id: 'files', data: remaining });
        items.push(entry);
        await storage.put('trash', { id: 'items', data: items });
        bus.emit('file:deleted', { path, trashId: entry.id });
        return { ok: true, trashId: entry.id };
      },
      async restore(trashId) {
        const idx = items.findIndex(t => t.id === trashId);
        if (idx < 0) return { ok: false };
        const entry = items[idx];
        const files = vfs.cache.get('files') || [];
        for (const item of entry.items) {
          if (files.some(f => f.path === item.path)) {
            item.name = item.name + ' (restored)';
            item.path = item.parent + '/' + item.name;
          }
          files.push(item);
        }
        vfs.cache.set('files', files);
        await storage.put('filesystem', { id: 'files', data: files });
        items.splice(idx, 1);
        await storage.put('trash', { id: 'items', data: items });
        bus.emit('file:restored', { path: entry.originalPath });
        return { ok: true };
      },
      async permanentDelete(trashId) {
        items = items.filter(t => t.id !== trashId);
        await storage.put('trash', { id: 'items', data: items });
        return { ok: true };
      },
      async empty() {
        items = [];
        await storage.put('trash', { id: 'items', data: items });
        return { ok: true };
      }
    };
  }

  // Clipboard with internal history
  function createClipboard(storage, bus) {
    let history = [];
    return {
      async init() {
        try {
          const rec = await storage?.get?.('clipboard', 'history');
          if (rec?.data) history = rec.data;
        } catch (_) {}
      },
      async writeText(text, meta = {}) {
        text = String(text ?? '');
        const item = { id: 'cb_' + Date.now(), text, ts: Date.now(), source: meta.source || 'system', preview: text.slice(0, 120) };
        let browserOk = false;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            browserOk = true;
          }
        } catch (_) {}
        history.unshift(item);
        if (history.length > 30) history.length = 30;
        try { await storage?.put?.('clipboard', { id: 'history', data: history.map(h => ({ ...h, text: (h.text || '').slice(0, 10000) })) }); } catch (_) {}
        bus.emit('clipboard:changed', { item, browserOk });
        return { ok: true, browserOk, item };
      },
      async readText() {
        try {
          if (navigator.clipboard?.readText) {
            return { text: await navigator.clipboard.readText(), source: 'browser' };
          }
        } catch (_) {}
        if (history.length) return { text: history[0].text, source: 'history' };
        return { text: '', source: 'empty' };
      },
      history: () => history.map(h => ({ id: h.id, preview: h.preview, ts: h.ts, source: h.source, length: h.text?.length || 0 })),
      getItem: (id) => history.find(h => h.id === id) || null,
      async clearHistory() {
        history = [];
        try { await storage?.put?.('clipboard', { id: 'history', data: [] }); } catch (_) {}
        bus.emit('clipboard:changed', { cleared: true });
      }
    };
  }

  // Theme
  function createTheme(storage, bus) {
    const THEMES = {
      dark: {
        '--bg-primary': '#09090B', '--text-primary': '#FAFAFA', '--accent': '#3B82F6',
        '--glass-bg': 'rgba(24,24,27,0.7)', '--glass-border': 'rgba(255,255,255,0.1)'
      },
      light: {
        '--bg-primary': '#F4F4F5', '--text-primary': '#18181B', '--accent': '#2563EB',
        '--glass-bg': 'rgba(255,255,255,0.75)', '--glass-border': 'rgba(0,0,0,0.08)'
      }
    };
    let mode = 'dark';
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function resolve() {
      if (mode === 'system') return mq.matches ? 'dark' : 'light';
      return mode;
    }
    function apply() {
      const r = resolve();
      const vars = THEMES[r] || THEMES.dark;
      for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
      document.documentElement.setAttribute('data-theme', r);
    }
    return {
      async init() {
        try {
          const p = await storage?.get?.('settings', 'prefs');
          if (p?.data?.theme) mode = p.data.theme;
        } catch (_) {}
        mq.addEventListener?.('change', () => { if (mode === 'system') apply(); });
        apply();
      },
      async setMode(m) {
        if (!['light', 'dark', 'system'].includes(m)) return;
        mode = m;
        apply();
        bus.emit('theme:changed', { mode: m });
        try {
          const p = await storage?.get?.('settings', 'prefs');
          await storage?.put?.('settings', { id: 'prefs', data: { ...(p?.data || {}), theme: m } });
        } catch (_) {}
      },
      getMode: () => mode,
      getResolved: resolve,
      setAccent(color) {
        document.documentElement.style.setProperty('--accent', color);
        document.documentElement.style.setProperty('--trosmos-accent', color);
      }
    };
  }

  // Workspaces
  function createWorkspaces(storage, bus) {
    const workspaces = [
      { id: 'ws-main', name: 'Main', index: 0 },
      { id: 'ws-work', name: 'Work', index: 1 },
      { id: 'ws-dev', name: 'Development', index: 2 },
      { id: 'ws-personal', name: 'Personal', index: 3 }
    ];
    let activeIndex = 0;
    const windowMap = new Map();
    function applyVisibility() {
      for (const [windowId, wsIndex] of windowMap) {
        const el = document.getElementById(windowId);
        if (!el) continue;
        if (wsIndex === activeIndex) {
          el.classList.remove('workspace-hidden');
          el.style.visibility = '';
        } else {
          el.classList.add('workspace-hidden');
          if (!el.classList.contains('minimized')) el.style.visibility = 'hidden';
        }
      }
    }
    async function persist() {
      try {
        await storage?.put?.('workspaces', {
          id: 'state',
          data: { activeIndex, windowMap: Object.fromEntries(windowMap) }
        });
      } catch (_) {}
    }
    return {
      async init() {
        try {
          const rec = await storage?.get?.('workspaces', 'state');
          if (typeof rec?.data?.activeIndex === 'number') activeIndex = rec.data.activeIndex;
          if (rec?.data?.windowMap) {
            for (const [k, v] of Object.entries(rec.data.windowMap)) windowMap.set(k, v);
          }
        } catch (_) {}
      },
      get active() { return workspaces[activeIndex]; },
      list: () => workspaces.map((w, i) => ({ ...w, active: i === activeIndex })),
      async switchTo(index) {
        if (index < 0 || index >= workspaces.length || index === activeIndex) return false;
        const prev = activeIndex;
        activeIndex = index;
        applyVisibility();
        bus.emit('workspace:changed', { from: prev, to: index, workspace: workspaces[index] });
        await persist();
        return true;
      },
      next() { return this.switchTo((activeIndex + 1) % workspaces.length); },
      prev() { return this.switchTo((activeIndex - 1 + workspaces.length) % workspaces.length); },
      assignWindow(windowId, idx) {
        windowMap.set(windowId, idx ?? activeIndex);
        applyVisibility();
        persist();
      },
      removeWindow(windowId) { windowMap.delete(windowId); persist(); }
    };
  }

  // Audit (lightweight)
  function createAudit(storage, bus) {
    let entries = [];
    const auto = ['app:opened', 'app:closed', 'app:failed', 'permission:granted', 'permission:denied',
      'file:created', 'file:deleted', 'file:restored', 'system:error', 'command:executed'];
    return {
      async init() {
        try {
          const rec = await storage?.get?.('audit', 'log');
          if (rec?.data) entries = rec.data;
        } catch (_) {}
        for (const ev of auto) {
          bus.on(ev, (data) => {
            const d = data ? { ...data } : {};
            delete d.content; delete d.body; delete d.text;
            entries.push({ id: 'a_' + Date.now(), type: ev, data: d, ts: Date.now() });
            if (entries.length > 500) entries = entries.slice(-500);
            try { storage?.put?.('audit', { id: 'log', data: entries.slice(-500) }); } catch (_) {}
          });
        }
      },
      recent: (n = 50) => entries.slice(-n).reverse(),
      clear() { entries = []; }
    };
  }

  // Session
  function createSession(storage, bus) {
    let locked = false;
    let idleTimer = null;
    const idleMs = 10 * 60 * 1000;
    function resetIdle() {
      if (idleTimer) clearTimeout(idleTimer);
      if (locked) return;
      idleTimer = setTimeout(() => api.lock(), idleMs);
    }
    const api = {
      async init() {
        ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
          window.addEventListener(ev, resetIdle, { passive: true })
        );
        resetIdle();
      },
      get locked() { return locked; },
      lock() {
        if (locked) return;
        locked = true;
        bus.emit('session:locked', {});
        const el = document.getElementById('lock-screen');
        if (el) { el.classList.remove('hidden'); el.style.display = ''; }
      },
      unlock() {
        if (!locked) return;
        locked = false;
        bus.emit('session:unlocked', {});
        const el = document.getElementById('lock-screen');
        if (el) { el.classList.add('hidden'); el.style.display = 'none'; }
        resetIdle();
      }
    };
    return api;
  }

  // Deep links
  function handleDeepLinks(apps) {
    try {
      const params = new URLSearchParams(window.location.search);
      const app = params.get('app');
      const file = params.get('file');
      const aliases = { ai: 'ai-assistant', files: 'file-manager', file: 'file-manager', calc: 'calculator', tasks: 'task-manager' };
      if (app) {
        const id = aliases[app] || app.replace(/[^a-z0-9-]/gi, '');
        const launch = () => {
          if (apps?.launch) apps.launch(id);
          else {
            const map = {
              'ai-assistant': 'openAIAssistant', 'file-manager': 'openFileManager',
              settings: 'openSettings', terminal: 'openTerminal', calculator: 'openCalculator',
              notes: 'openNotes', clock: 'openClock', clipboard: 'openClipboard',
              browser: 'openBrowser', 'task-manager': 'openTaskManager', 'app-store': 'openAppStore'
            };
            window[map[id]]?.();
          }
        };
        if (window.Trosmos?.vfs) setTimeout(launch, 300);
        else setTimeout(launch, 1200);
      }
      if (file && !file.includes('..')) {
        setTimeout(() => {
          const f = window.Trosmos?.vfs?.getFile?.(file);
          if (f && window.Trosmos?.desktop?.openTextEditor) window.Trosmos.desktop.openTextEditor(f);
        }, 800);
      }
    } catch (_) {}
  }

  // Register core apps into registry
  function registerCoreApps(apps) {
    const defs = [
      { id: 'ai-assistant', name: 'Trosmos AI', icon: 'fa-robot', category: 'core', windowId: 'ai-window', singleton: true, keywords: ['ai', 'chat', 'copilot'], fileTypes: [], launch: () => window.openAIAssistant?.() },
      { id: 'file-manager', name: 'Files', icon: 'fa-folder', category: 'productivity', windowId: 'file-manager-window', singleton: true, keywords: ['files', 'folder'], fileTypes: [], launch: () => window.openFileManager?.() },
      { id: 'browser', name: 'Browser', icon: 'fa-globe', category: 'productivity', windowId: 'browser-window', singleton: true, keywords: ['web', 'internet'], launch: () => window.openBrowser?.() },
      { id: 'settings', name: 'Settings', icon: 'fa-cog', category: 'system', windowId: 'settings-window', singleton: true, keywords: ['preferences', 'config'], launch: () => window.openSettings?.() },
      { id: 'task-manager', name: 'Task Manager', icon: 'fa-microchip', category: 'system', windowId: 'task-manager-window', singleton: true, keywords: ['processes', 'tasks'], launch: () => window.openTaskManager?.() },
      { id: 'app-store', name: 'App Store', icon: 'fa-store', category: 'discover', windowId: 'app-store-window', singleton: true, launch: () => window.openAppStore?.() },
      { id: 'terminal', name: 'Terminal', icon: 'fa-terminal', category: 'system', windowId: 'terminal-window', singleton: true, keywords: ['shell', 'console'], launch: () => window.openTerminal?.() },
      { id: 'calculator', name: 'Calculator', icon: 'fa-calculator', category: 'utilities', windowId: 'calculator-window', singleton: true, keywords: ['calc', 'math'], launch: () => window.openCalculator?.() },
      { id: 'notes', name: 'Notes', icon: 'fa-note-sticky', category: 'productivity', windowId: 'notes-window', singleton: true, keywords: ['note', 'write'], fileTypes: ['md', 'txt', 'text'], launch: () => window.openNotes?.() },
      { id: 'clock', name: 'Clock', icon: 'fa-clock', category: 'utilities', windowId: 'clock-window', singleton: true, launch: () => window.openClock?.() },
      { id: 'clipboard', name: 'Clipboard', icon: 'fa-clipboard', category: 'utilities', windowId: 'clipboard-window', singleton: true, launch: () => window.openClipboard?.() },
      { id: 'help', name: 'Help', icon: 'fa-circle-question', category: 'system', windowId: 'help-window', singleton: true, launch: () => window.openHelp?.() },
      { id: 'system-monitor', name: 'System Monitor', icon: 'fa-chart-line', category: 'system', windowId: 'system-monitor-window', singleton: true, keywords: ['monitor', 'metrics', 'performance'], launch: () => window.openSystemMonitor?.() }
    ];
    for (const d of defs) apps.register(d);
  }

  function registerBuiltinCommands(commands, kernel) {
    const list = [
      { id: 'open-ai', label: 'Open Trosmos AI', keywords: 'ai assistant copilot', category: 'apps', action: () => kernel.apps.launch('ai-assistant') },
      { id: 'open-files', label: 'Open Files', keywords: 'files folder manager', category: 'apps', action: () => kernel.apps.launch('file-manager') },
      { id: 'open-settings', label: 'Open Settings', keywords: 'settings preferences', category: 'apps', action: () => kernel.apps.launch('settings') },
      { id: 'open-terminal', label: 'Open Terminal', keywords: 'terminal shell', category: 'apps', action: () => kernel.apps.launch('terminal') },
      { id: 'open-calculator', label: 'Open Calculator', keywords: 'calc calculator math', category: 'apps', action: () => kernel.apps.launch('calculator') },
      { id: 'open-notes', label: 'Open Notes', keywords: 'notes write', category: 'apps', action: () => kernel.apps.launch('notes') },
      { id: 'open-monitor', label: 'Open System Monitor', keywords: 'monitor system metrics', category: 'system', action: () => kernel.apps.launch('system-monitor') },
      { id: 'lock-session', label: 'Lock Session', keywords: 'lock screen', category: 'system', action: () => kernel.session.lock() },
      { id: 'theme-dark', label: 'Theme: Dark', keywords: 'theme dark', category: 'settings', action: () => kernel.theme.setMode('dark') },
      { id: 'theme-light', label: 'Theme: Light', keywords: 'theme light', category: 'settings', action: () => kernel.theme.setMode('light') },
      { id: 'theme-system', label: 'Theme: System', keywords: 'theme system auto', category: 'settings', action: () => kernel.theme.setMode('system') },
      { id: 'ws-1', label: 'Workspace: Main', keywords: 'workspace main', category: 'system', action: () => kernel.workspaces.switchTo(0) },
      { id: 'ws-2', label: 'Workspace: Work', keywords: 'workspace work', category: 'system', action: () => kernel.workspaces.switchTo(1) },
      { id: 'ws-3', label: 'Workspace: Development', keywords: 'workspace development', category: 'system', action: () => kernel.workspaces.switchTo(2) },
      { id: 'ws-4', label: 'Workspace: Personal', keywords: 'workspace personal', category: 'system', action: () => kernel.workspaces.switchTo(3) },
      { id: 'undo', label: 'Undo', keywords: 'undo', category: 'edit', action: () => kernel.undo.undo() },
      { id: 'redo', label: 'Redo', keywords: 'redo', category: 'edit', action: () => kernel.undo.redo() },
      { id: 'empty-trash', label: 'Empty Trash', keywords: 'trash empty', category: 'files', action: async () => { await kernel.trash?.empty(); window.Trosmos?.notifications?.show?.('Trash emptied', 'info'); } }
    ];
    for (const c of list) commands.register(c);
  }

  // System Monitor window
  function ensureSystemMonitorApp() {
    if (document.getElementById('system-monitor-window')) return;
    const win = document.createElement('div');
    win.id = 'system-monitor-window';
    win.className = 'window glass-strong';
    win.style.cssText = 'display:none;width:520px;height:480px;left:120px;top:80px;z-index:100;';
    win.innerHTML = `
      <div class="window-titlebar">
        <div class="window-title"><i class="fa-solid fa-chart-line mr-2"></i>System Monitor</div>
        <div class="window-controls">
          <button type="button" class="window-control minimize" aria-label="Minimize" onclick="Trosmos.windows.minimize('system-monitor-window')"><i class="fa-solid fa-minus"></i></button>
          <button type="button" class="window-control maximize" aria-label="Maximize" onclick="Trosmos.windows.maximize('system-monitor-window')"><i class="fa-regular fa-square"></i></button>
          <button type="button" class="window-control close" aria-label="Close" onclick="Trosmos.windows.close('system-monitor-window')"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="window-content p-4 overflow-auto text-sm" id="system-monitor-content">
        <div class="text-white/50">Loading metrics…</div>
      </div>`;
    document.body.appendChild(win);
  }

  window.openSystemMonitor = async function () {
    ensureSystemMonitorApp();
    if (window.Trosmos?.windows?.focusOrOpen) {
      window.Trosmos.windows.focusOrOpen('system-monitor-window');
    } else {
      const el = document.getElementById('system-monitor-window');
      if (el) { el.style.display = 'flex'; el.style.flexDirection = 'column'; }
    }
    const content = document.getElementById('system-monitor-content');
    if (!content) return;
    const mon = window.Trosmos?.monitor;
    if (!mon) {
      content.innerHTML = '<div class="text-white/50">System monitor not available</div>';
      return;
    }
    const report = await mon.fullReport();
    const fmtBytes = (n) => {
      if (n == null) return 'N/A';
      if (n < 1024) return n + ' B';
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
      if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
      return (n / 1073741824).toFixed(2) + ' GB';
    };
    const uptime = report.uptimeMs ? Math.floor(report.uptimeMs / 1000) + 's' : 'N/A';
    content.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 rounded-xl bg-white/5 border border-white/10">
            <div class="text-white/40 text-xs mb-1">Uptime</div>
            <div class="text-lg font-semibold">${uptime}</div>
          </div>
          <div class="p-3 rounded-xl bg-white/5 border border-white/10">
            <div class="text-white/40 text-xs mb-1">Network</div>
            <div class="text-lg font-semibold capitalize">${report.network?.status || 'unknown'}</div>
          </div>
          <div class="p-3 rounded-xl bg-white/5 border border-white/10">
            <div class="text-white/40 text-xs mb-1">Open Windows</div>
            <div class="text-lg font-semibold">${report.windows?.open ?? '—'} <span class="text-white/40 text-sm">(${report.windows?.minimized ?? 0} min)</span></div>
          </div>
          <div class="p-3 rounded-xl bg-white/5 border border-white/10">
            <div class="text-white/40 text-xs mb-1">Service Worker</div>
            <div class="text-lg font-semibold">${report.serviceWorker?.controlled ? 'Active' : (report.serviceWorker?.supported ? 'Registered' : 'N/A')}</div>
          </div>
        </div>
        <div class="p-3 rounded-xl bg-white/5 border border-white/10">
          <div class="text-white/40 text-xs mb-2">Memory (JS Heap)</div>
          ${report.memory?.available === false
            ? `<div class="text-white/50 text-xs">${report.memory.note}</div>`
            : `<div>Used: ${fmtBytes(report.memory?.usedJSHeapSize)} / ${fmtBytes(report.memory?.totalJSHeapSize)}</div>
               <div class="text-white/40 text-xs mt-1">Limit: ${fmtBytes(report.memory?.jsHeapSizeLimit)}</div>
               <div class="text-white/30 text-xs mt-1">${report.memory?.note || ''}</div>`}
        </div>
        <div class="p-3 rounded-xl bg-white/5 border border-white/10">
          <div class="text-white/40 text-xs mb-2">Storage</div>
          ${report.storage?.available === false
            ? `<div class="text-white/50 text-xs">${report.storage.note}</div>`
            : `<div>Usage: ${fmtBytes(report.storage?.usage)} / ${fmtBytes(report.storage?.quota)} (${report.storage?.usagePercent ?? '—'}%)</div>`}
        </div>
        <div class="p-3 rounded-xl bg-white/5 border border-white/10">
          <div class="text-white/40 text-xs mb-2">Network Details</div>
          <div class="text-xs space-y-1 text-white/70">
            <div>Online: ${report.network?.online ? 'Yes' : 'No'}</div>
            <div>Effective type: ${report.network?.effectiveType || 'N/A'}</div>
            <div>Downlink: ${report.network?.downlink != null ? report.network.downlink + ' Mbps' : 'N/A'}</div>
            <div>RTT: ${report.network?.rtt != null ? report.network.rtt + ' ms' : 'N/A'}</div>
          </div>
        </div>
        <div class="text-white/30 text-xs">Metrics use only real browser APIs. Unavailable values are marked N/A — never fabricated.</div>
        <button type="button" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs" onclick="openSystemMonitor()">Refresh</button>
      </div>`;
  };

  // Enhanced launcher / command palette integration
  function enhanceLauncher(kernel) {
    // Override palette search to use unified index when available
    const origRender = window.renderPaletteResults;
    if (typeof origRender === 'function') {
      // Keep original but enrich via commands
    }

    // Keyboard: Ctrl+Shift+Z redo, Ctrl+Z undo (when not in input)
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const editable = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if (editable) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (kernel.undo.canUndo()) {
          e.preventDefault();
          kernel.undo.undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        if (kernel.undo.canRedo()) {
          e.preventDefault();
          kernel.undo.redo();
        }
      }
      // Workspace switching: Ctrl+Alt+1..4
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        kernel.workspaces.switchTo(parseInt(e.key, 10) - 1);
      }
    });
  }

  // Patch VFS delete to use trash when available
  function patchVfsTrash(kernel) {
    const vfs = window.Trosmos?.vfs;
    if (!vfs || !kernel.trash) return;
    const origDelete = vfs.delete?.bind(vfs);
    if (!origDelete) return;
    vfs.delete = async function (path, opts = {}) {
      if (opts.permanent) return origDelete(path);
      const result = await kernel.trash.softDelete(path);
      if (result.ok) {
        window.Trosmos?.notifications?.show?.('Moved to Trash', 'info');
        return true;
      }
      return origDelete(path);
    };
    vfs.restoreFromTrash = (id) => kernel.trash.restore(id);
    vfs.emptyTrash = () => kernel.trash.empty();
    vfs.listTrash = () => kernel.trash.list();
  }

  // Index files into search
  function indexFiles(kernel) {
    kernel.search.scheduleReindex(() => {
      kernel.search.clear('file');
      kernel.search.clear('note');
      try {
        const files = window.Trosmos?.vfs?.cache?.get('files') || [];
        for (const f of files) {
          const isNote = f.type === 'file' && /\.(md|txt|text)$/i.test(f.name);
          kernel.search.add({
            id: 'file:' + f.path,
            type: isNote ? 'note' : 'file',
            title: f.name,
            body: isNote ? (f.content || '').slice(0, 200) : '',
            keywords: f.path,
            meta: { path: f.path, mime: f.mime, fileType: f.type }
          });
        }
      } catch (_) {}
    });
  }

  // Diagnose helper
  async function diagnose(kernel) {
    const report = {
      version: VERSION,
      ready: true,
      storage: !!window.Trosmos?.storage,
      vfs: !!window.Trosmos?.vfs,
      indexedDB: typeof indexedDB !== 'undefined',
      apps: kernel.apps.list().length,
      commands: kernel.commands.list().length,
      searchDocs: kernel.search.size(),
      network: kernel.network.getInfo(),
      theme: kernel.theme.getMode(),
      workspace: kernel.workspaces.active?.name,
      metrics: await kernel.monitor.fullReport()
    };
    const issues = [];
    if (!report.storage) issues.push('Storage unavailable');
    if (!report.vfs) issues.push('VFS not initialized');
    if (!report.indexedDB) issues.push('IndexedDB unavailable');
    if (report.network.status === 'offline') issues.push('Network offline');
    report.issues = issues;
    report.healthy = issues.length === 0;
    return report;
  }

  // Main boot
  async function bootKernel() {
    const T = window.Trosmos;
    if (!T) {
      console.warn('[Kernel] Trosmos not ready, retrying…');
      setTimeout(bootKernel, 200);
      return;
    }

    const bus = window.__TrosmosEventBus || createInlineEventBus();
    window.__TrosmosEventBus = bus;

    const apps = createAppRegistry(bus);
    const commands = createCommandRegistry(bus);
    const search = createSearchIndex();
    const undo = createUndoManager();
    const network = createNetworkService(bus);
    const monitor = createSystemMonitor(network);

    const kernel = {
      version: VERSION,
      eventBus: bus,
      apps,
      commands,
      search,
      undo,
      network,
      monitor,
      storage: T.storage,
      vfs: T.vfs,
      permissions: T.permissions || null,
      trash: null,
      clipboard: null,
      theme: null,
      workspaces: null,
      audit: null,
      session: null,
      diagnose: () => diagnose(kernel)
    };

    // Init services that need storage
    kernel.trash = createTrash(T.storage, T.vfs, bus);
    await kernel.trash.init();

    kernel.clipboard = createClipboard(T.storage, bus);
    await kernel.clipboard.init();

    kernel.theme = createTheme(T.storage, bus);
    await kernel.theme.init();

    kernel.workspaces = createWorkspaces(T.storage, bus);
    await kernel.workspaces.init();

    kernel.audit = createAudit(T.storage, bus);
    await kernel.audit.init();

    kernel.session = createSession(T.storage, bus);
    await kernel.session.init();

    registerCoreApps(apps);
    registerBuiltinCommands(commands, kernel);
    ensureSystemMonitorApp();
    enhanceLauncher(kernel);
    patchVfsTrash(kernel);

    // Index apps + commands
    for (const a of apps.list()) {
      search.add({ id: 'app:' + a.id, type: 'app', title: a.name, keywords: (a.keywords || []).join(' ') + ' ' + a.id, boost: 1.5, meta: { appId: a.id, icon: a.icon } });
    }
    for (const c of commands.list()) {
      search.add({ id: 'cmd:' + c.id, type: 'command', title: c.label, keywords: c.keywords || '', boost: 1.2, meta: { commandId: c.id } });
    }
    indexFiles(kernel);

    // Expose controlled APIs
    T.kernel = kernel;
    T.version = VERSION;
    T.events = bus;
    T.apps = {
      register: (d) => apps.register(d),
      launch: (id, o) => apps.launch(id, o),
      close: (id) => apps.close(id),
      list: () => apps.list(),
      get: (id) => apps.get(id),
      state: (id) => apps.state(id),
      search: (q) => apps.search(q)
    };
    T.commands = {
      register: (c) => commands.register(c),
      search: (q) => commands.search(q),
      execute: (id) => commands.execute(id),
      list: () => commands.list()
    };
    T.search = {
      query: (q, o) => search.search(q, o),
      add: (d) => search.add(d),
      remove: (id) => search.remove(id)
    };
    T.clipboard = kernel.clipboard;
    T.theme = kernel.theme;
    T.workspaces = kernel.workspaces;
    T.trash = kernel.trash;
    T.undo = kernel.undo;
    T.audit = kernel.audit;
    T.session = kernel.session;
    T.network = kernel.network;
    T.monitor = kernel.monitor;
    T.on = (e, h) => bus.on(e, h);
    T.off = (e, h) => bus.off(e, h);
    T.diagnose = () => diagnose(kernel);

    window.__TrosmosAppRegistry = apps;
    window.__TrosmosCommands = commands;
    window.__TrosmosSearch = search;
    window.__TrosmosUndo = undo;
    window.__TrosmosNetwork = network;
    window.__TrosmosMonitor = monitor;
    window.__TrosmosKernel = kernel;

    // Enhance command palette to use unified search
    const origShow = window.showCommandPalette;
    if (typeof window.renderPaletteResults === 'function') {
      const nativeRender = window.renderPaletteResults;
      window.renderPaletteResults = function (query) {
        // Prefer kernel search when query present
        if (query && query.trim() && kernel.search) {
          const results = kernel.search.search(query, { limit: 20 });
          const container = document.getElementById('palette-results');
          if (!container) return nativeRender(query);
          if (!results.length) {
            container.innerHTML = '<div class="px-4 py-6 text-center text-white/40 text-sm">No results</div>';
            return;
          }
          container.innerHTML = results.map((r, i) => {
            const icon = r.meta?.icon || (r.type === 'app' ? 'fa-window-maximize' : r.type === 'command' ? 'fa-terminal' : r.type === 'file' || r.type === 'note' ? 'fa-file' : 'fa-circle');
            const badge = r.type || '';
            return `<div class="palette-item flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/10 ${i === 0 ? 'bg-white/5' : ''}" data-idx="${i}" data-type="${r.type}" data-id="${r.meta?.appId || r.meta?.commandId || r.meta?.path || r.id}">
              <i class="fa-solid ${icon} text-white/50 w-5 text-center"></i>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-white truncate">${(r.title || '').replace(/</g, '&lt;')}</div>
                <div class="text-xs text-white/40">${badge}</div>
              </div>
            </div>`;
          }).join('');
          container.querySelectorAll('.palette-item').forEach(el => {
            el.addEventListener('click', () => {
              const type = el.dataset.type;
              const id = el.dataset.id;
              if (type === 'app') kernel.apps.launch(id);
              else if (type === 'command') kernel.commands.execute(id);
              else if ((type === 'file' || type === 'note') && id) {
                const f = window.Trosmos?.vfs?.getFile?.(id);
                if (f) window.Trosmos?.desktop?.openTextEditor?.(f);
              }
              window.hideCommandPalette?.();
            });
          });
          return;
        }
        return nativeRender(query);
      };
    }

    // Window open → assign to current workspace
    bus.on('window:created', ({ id }) => {
      kernel.workspaces.assignWindow(id);
    });

    // Hook existing window manager focus/close if possible
    if (T.windows) {
      const origFocus = T.windows.focusOrOpen?.bind(T.windows);
      const origClose = T.windows.close?.bind(T.windows);
      if (origFocus) {
        T.windows.focusOrOpen = function (id) {
          const r = origFocus(id);
          bus.emit('window:focused', { id });
          kernel.workspaces.assignWindow(id);
          return r;
        };
      }
      if (origClose) {
        T.windows.close = function (id) {
          const r = origClose(id);
          bus.emit('window:closed', { id });
          kernel.workspaces.removeWindow(id);
          return r;
        };
      }
    }

    handleDeepLinks(apps);

    bus.emit('system:ready', { version: VERSION });
    console.log('%c[Trosmos OS] v' + VERSION + ' kernel online — apps, commands, search, trash, workspaces, theme, clipboard, undo, audit, monitor', 'color:#10B981;font-weight:bold');

    // Self-check
    setTimeout(async () => {
      const d = await diagnose(kernel);
      if (!d.healthy) console.warn('[Trosmos Diagnose]', d.issues);
      else console.log('%c[Trosmos Diagnose] healthy', 'color:#10B981');
    }, 1500);
  }

  // Wait for main shell
  function waitForShell() {
    if (window.Trosmos?.storage && window.Trosmos?.vfs) {
      bootKernel();
    } else if (window.Trosmos) {
      // Storage may still be initializing
      setTimeout(waitForShell, 150);
    } else {
      setTimeout(waitForShell, 100);
    }
  }

  if (document.readyState === 'complete') waitForShell();
  else window.addEventListener('load', () => setTimeout(waitForShell, 50));
})();
