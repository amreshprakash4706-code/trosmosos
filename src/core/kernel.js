/**
 * Trosmos OS 4.0 — Kernel-like Core
 * Owns application lifecycle, process-like instances, system events,
 * global state, permissions, window management hooks, storage,
 * notifications, commands, shortcuts, and system services.
 *
 * Applications must not directly manipulate unrelated OS internals.
 * Prefer controlled APIs exposed on the Trosmos namespace.
 */

import { eventBus } from './event-bus.js';
import { appRegistry } from './app-registry.js';
import { commandRegistry } from './command-registry.js';
import { searchIndex } from './search-index.js';
import { PermissionManager } from './permissions.js';
import { WorkspaceManager } from './workspace-manager.js';
import { networkService } from './network-service.js';
import { systemMonitor } from './system-monitor.js';
import { undoManager } from './undo-manager.js';
import AuditLog from './audit-log.js';
import ClipboardService from './clipboard-service.js';
import ThemeEngine from './theme-engine.js';
import SessionManager from './session.js';
import MigrationEngine from './migration.js';
import { crashRecovery } from './crash-recovery.js';
import DeepLinkHandler from './deep-links.js';
import { i18n } from './i18n.js';
import TrashService from '../filesystem/trash.js';

const VERSION = '4.0.0';

export class TrosmosKernel {
  constructor() {
    this.version = VERSION;
    this.ready = false;
    this.eventBus = eventBus;
    this.apps = appRegistry;
    this.commands = commandRegistry;
    this.search = searchIndex;
    this.undo = undoManager;
    this.network = networkService;
    this.monitor = systemMonitor;
    this.i18n = i18n;
    this.crash = crashRecovery;

    // Initialized in boot()
    this.permissions = null;
    this.workspaces = null;
    this.audit = null;
    this.clipboard = null;
    this.theme = null;
    this.session = null;
    this.trash = null;
    this.deepLinks = null;
    this.storage = null;
    this.vfs = null;
  }

  /**
   * Boot sequence — critical shell first, then services, then apps.
   * Does not block on non-critical services.
   */
  async boot(existingTrosmos) {
    console.log(`%c[Trosmos Kernel] v${VERSION} booting…`, 'color:#3B82F6;font-weight:bold');

    // Reuse storage / vfs from existing shell if present
    this.storage = existingTrosmos?.storage || null;
    this.vfs = existingTrosmos?.vfs || null;

    if (!this.storage) {
      console.warn('[Kernel] No storage — deferred init');
    }

    // Migrations first (when storage available)
    if (this.storage) {
      try {
        const migrator = new MigrationEngine(this.storage);
        const result = await migrator.run();
        if (result.migrated) {
          console.log(`[Kernel] Migrated schema ${result.from} → ${result.to}`);
        }
      } catch (err) {
        console.error('[Kernel] Migration failed', err);
        eventBus.emit('system:error', { source: 'migration', error: String(err) });
      }
    }

    // Core services
    this.permissions = new PermissionManager(this.storage);
    await this.permissions.init();

    this.workspaces = new WorkspaceManager(this.storage);
    await this.workspaces.init();

    this.audit = new AuditLog(this.storage);
    await this.audit.init();

    this.clipboard = new ClipboardService(this.storage);
    await this.clipboard.init();

    this.theme = new ThemeEngine(this.storage);
    await this.theme.init();

    this.session = new SessionManager(this.storage);
    await this.session.init();

    if (this.vfs && this.storage) {
      this.trash = new TrashService(this.storage, this.vfs);
      await this.trash.init();
    }

    this.deepLinks = new DeepLinkHandler(this.apps);
    networkService.init();
    crashRecovery.init();

    // Wire controlled APIs onto existing Trosmos object
    this._exposeAPIs(existingTrosmos);

    // Register built-in commands
    this._registerBuiltinCommands(existingTrosmos);

    // Index apps into search
    this._indexApps();

    // File change → search index
    eventBus.on('file:created', () => this._scheduleFileIndex());
    eventBus.on('file:deleted', () => this._scheduleFileIndex());
    eventBus.on('file:changed', () => this._scheduleFileIndex());
    eventBus.on('file:renamed', () => this._scheduleFileIndex());
    eventBus.on('file:restored', () => this._scheduleFileIndex());

    // Initial file index (non-blocking)
    setTimeout(() => this._scheduleFileIndex(), 100);

    // Deep links
    this.deepLinks.handle();

    this.ready = true;
    eventBus.emit('system:ready', { version: VERSION });
    console.log(`%c[Trosmos Kernel] v${VERSION} ready`, 'color:#10B981;font-weight:bold');

    return this;
  }

  _exposeAPIs(T) {
    if (!T) return;
    T.kernel = this;
    T.version = VERSION;
    T.events = eventBus;
    T.apps = {
      register: (def) => this.apps.register(def),
      launch: (id, opts) => this.apps.launch(id, opts),
      close: (id) => this.apps.close(id),
      list: (f) => this.apps.list(f),
      get: (id) => this.apps.get(id),
      state: (id) => this.apps.state(id),
      search: (q) => this.apps.search(q)
    };
    T.commands = {
      register: (c) => this.commands.register(c),
      search: (q) => this.commands.search(q),
      execute: (id, args) => this.commands.execute(id, args),
      list: (f) => this.commands.list(f)
    };
    T.search = {
      query: (q, opts) => this.search.search(q, opts),
      add: (doc) => this.search.add(doc),
      remove: (id) => this.search.remove(id)
    };
    T.permissions = this.permissions;
    T.workspaces = this.workspaces;
    T.clipboard = this.clipboard;
    T.theme = this.theme;
    T.session = this.session;
    T.trash = this.trash;
    T.undo = this.undo;
    T.audit = this.audit;
    T.network = this.network;
    T.monitor = this.monitor;
    T.i18n = this.i18n;
    T.crash = this.crash;

    // Safe event subscription for apps
    T.on = (event, handler) => eventBus.on(event, handler);
    T.off = (event, handler) => eventBus.off(event, handler);
  }

  _registerBuiltinCommands(T) {
    const cmds = [
      { id: 'open-ai', label: 'Open Trosmos AI', keywords: 'ai assistant copilot chat', category: 'apps', icon: 'fa-robot', action: () => this.apps.launch('ai-assistant') },
      { id: 'open-files', label: 'Open Files', keywords: 'files folder manager vfs', category: 'apps', icon: 'fa-folder', action: () => this.apps.launch('file-manager') },
      { id: 'open-settings', label: 'Open Settings', keywords: 'settings preferences config', category: 'apps', icon: 'fa-cog', action: () => this.apps.launch('settings') },
      { id: 'open-terminal', label: 'Open Terminal', keywords: 'terminal shell console', category: 'apps', icon: 'fa-terminal', action: () => this.apps.launch('terminal') },
      { id: 'open-calculator', label: 'Open Calculator', keywords: 'calc calculator math', category: 'apps', icon: 'fa-calculator', action: () => this.apps.launch('calculator') },
      { id: 'open-notes', label: 'Open Notes', keywords: 'notes write memo', category: 'apps', icon: 'fa-note-sticky', action: () => this.apps.launch('notes') },
      { id: 'open-clock', label: 'Open Clock', keywords: 'clock time timer stopwatch', category: 'apps', icon: 'fa-clock', action: () => this.apps.launch('clock') },
      { id: 'open-clipboard', label: 'Open Clipboard', keywords: 'clipboard paste history', category: 'apps', icon: 'fa-clipboard', action: () => this.apps.launch('clipboard') },
      { id: 'open-browser', label: 'Open Browser', keywords: 'browser web internet', category: 'apps', icon: 'fa-globe', action: () => this.apps.launch('browser') },
      { id: 'open-tasks', label: 'Open Task Manager', keywords: 'tasks processes manager', category: 'system', icon: 'fa-microchip', action: () => this.apps.launch('task-manager') },
      { id: 'open-monitor', label: 'Open System Monitor', keywords: 'monitor system metrics performance', category: 'system', icon: 'fa-chart-line', action: () => this.apps.launch('system-monitor') },
      { id: 'lock-session', label: 'Lock Session', keywords: 'lock screen session security', category: 'system', icon: 'fa-lock', action: () => this.session?.lock() },
      { id: 'switch-ws-1', label: 'Switch to Main Workspace', keywords: 'workspace desktop main', category: 'system', action: () => this.workspaces?.switchTo(0) },
      { id: 'switch-ws-2', label: 'Switch to Work Workspace', keywords: 'workspace desktop work', category: 'system', action: () => this.workspaces?.switchTo(1) },
      { id: 'switch-ws-3', label: 'Switch to Development Workspace', keywords: 'workspace desktop development', category: 'system', action: () => this.workspaces?.switchTo(2) },
      { id: 'switch-ws-4', label: 'Switch to Personal Workspace', keywords: 'workspace desktop personal', category: 'system', action: () => this.workspaces?.switchTo(3) },
      { id: 'theme-dark', label: 'Theme: Dark', keywords: 'theme dark mode appearance', category: 'settings', action: () => this.theme?.setMode('dark') },
      { id: 'theme-light', label: 'Theme: Light', keywords: 'theme light mode appearance', category: 'settings', action: () => this.theme?.setMode('light') },
      { id: 'theme-system', label: 'Theme: System', keywords: 'theme system auto appearance', category: 'settings', action: () => this.theme?.setMode('system') },
      { id: 'undo', label: 'Undo', keywords: 'undo reverse', category: 'edit', icon: 'fa-rotate-left', action: () => this.undo.undo() },
      { id: 'redo', label: 'Redo', keywords: 'redo', category: 'edit', icon: 'fa-rotate-right', action: () => this.undo.redo() },
      { id: 'empty-trash', label: 'Empty Trash', keywords: 'trash empty delete permanent', category: 'files', action: async () => { await this.trash?.empty(); T?.notifications?.show?.('Trash emptied', 'info'); } },
      { id: 'clear-clipboard-history', label: 'Clear Clipboard History', keywords: 'clipboard clear history', category: 'system', action: async () => { await this.clipboard?.clearHistory(); T?.notifications?.show?.('Clipboard history cleared', 'info'); } }
    ];

    for (const c of cmds) this.commands.register(c);
  }

  _indexApps() {
    for (const app of this.apps.list()) {
      this.search.add({
        id: `app:${app.id}`,
        type: 'app',
        title: app.name,
        keywords: `${app.id} ${app.category || ''} ${(app.keywords || []).join(' ')}`,
        boost: 1.5,
        meta: { appId: app.id, icon: app.icon }
      });
    }
    for (const cmd of this.commands.list()) {
      this.search.add({
        id: `cmd:${cmd.id}`,
        type: 'command',
        title: cmd.label,
        keywords: cmd.keywords || '',
        boost: 1.2,
        meta: { commandId: cmd.id, icon: cmd.icon }
      });
    }
  }

  _scheduleFileIndex() {
    this.search.scheduleReindex(() => {
      this.search.clear('file');
      this.search.clear('note');
      try {
        const files = this.vfs?.cache?.get('files') || [];
        for (const f of files) {
          if (f.type === 'folder') {
            this.search.add({
              id: `file:${f.path}`,
              type: 'file',
              title: f.name,
              keywords: f.path,
              meta: { path: f.path, type: 'folder' }
            });
          } else {
            const isNote = /\.(md|txt|text)$/i.test(f.name);
            this.search.add({
              id: `file:${f.path}`,
              type: isNote ? 'note' : 'file',
              title: f.name,
              body: isNote ? (f.content || '').slice(0, 200) : '',
              keywords: f.path,
              meta: { path: f.path, mime: f.mime }
            });
          }
        }
      } catch (err) {
        console.warn('[Kernel] file index error', err);
      }
    });
  }

  /** Self-diagnostic health check */
  async diagnose() {
    const report = {
      version: VERSION,
      ready: this.ready,
      storage: !!this.storage,
      vfs: !!this.vfs,
      indexedDB: typeof indexedDB !== 'undefined',
      serviceWorker: 'serviceWorker' in navigator,
      network: this.network.getInfo(),
      appsRegistered: this.apps.list().length,
      commandsRegistered: this.commands.list().length,
      searchDocs: this.search.size(),
      theme: this.theme?.getMode?.(),
      workspace: this.workspaces?.active?.name,
      failures: this.crash.getFailures(),
      shellErrors: this.crash.getShellErrors().slice(-5),
      metrics: await this.monitor.fullReport()
    };

    const issues = [];
    if (!report.storage) issues.push('Storage unavailable');
    if (!report.vfs) issues.push('Virtual filesystem not initialized');
    if (!report.indexedDB) issues.push('IndexedDB not available');
    if (report.network.status === 'offline') issues.push('Network offline');
    if (Object.keys(report.failures).length) issues.push('App failures detected');

    report.issues = issues;
    report.healthy = issues.length === 0;
    return report;
  }
}

export default TrosmosKernel;
