/**
 * Trosmos OS 2.8 — Built-in Applications Extension
 * Full app registry, upgraded Terminal/Calculator/Notes/Clipboard,
 * system services bridge. Loaded after core OS. Expects Trosmos, escapeHtml.
 */
(function () {
  'use strict';

  const OS_VERSION = '4.0.0';

  function esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function registerWin(id, el) {
    if (window.Trosmos?.windows?.register) {
      Trosmos.windows.register(id, el);
    }
  }

  function focusOrOpen(id) {
    if (window.Trosmos?.windows?.focusOrOpen) Trosmos.windows.focusOrOpen(id);
    else {
      const w = document.getElementById(id);
      if (w) {
        w.classList.remove('hidden');
        if (window.Trosmos?.windows?.focus) Trosmos.windows.focus(id);
      }
    }
  }

  /* ---------- Application Registry (single source of truth) ---------- */
  const AppRegistry = {
    apps: {
      ai: { id: 'ai', name: 'Trosmos AI', icon: 'fa-robot', category: 'System', version: '4.0', description: 'Intelligent OS copilot', windowId: 'ai-window', singleton: true, defaultSize: { w: 420, h: 560 }, minSize: { w: 320, h: 400 }, permissions: ['EXECUTE'], launch: () => typeof openAIAssistant === 'function' && openAIAssistant() },
      files: { id: 'files', name: 'Files', icon: 'fa-folder', category: 'System', version: '4.0', description: 'Virtual filesystem manager', windowId: 'file-manager-window', singleton: true, defaultSize: { w: 780, h: 520 }, minSize: { w: 480, h: 320 }, permissions: ['READ', 'WRITE'], launch: () => typeof openFileManager === 'function' && openFileManager() },
      browser: { id: 'browser', name: 'Browser', icon: 'fa-globe', category: 'Internet', version: '4.0', description: 'Web browser with tabs', windowId: 'browser-window', singleton: true, defaultSize: { w: 900, h: 600 }, minSize: { w: 480, h: 360 }, permissions: ['EXECUTE'], launch: () => typeof openBrowser === 'function' && openBrowser() },
      settings: { id: 'settings', name: 'Settings', icon: 'fa-gear', category: 'System', version: '4.0', description: 'System preferences', windowId: 'settings-window', singleton: true, defaultSize: { w: 720, h: 520 }, minSize: { w: 480, h: 360 }, permissions: ['SYSTEM'], launch: () => typeof openSettings === 'function' && openSettings() },
      'app-store': { id: 'app-store', name: 'App Store', icon: 'fa-store', category: 'System', version: '4.0', description: 'Discover Trosmos apps', windowId: 'app-store-window', singleton: true, defaultSize: { w: 720, h: 520 }, minSize: { w: 420, h: 360 }, permissions: ['EXECUTE'], launch: () => typeof openAppStore === 'function' && openAppStore() },
      'task-manager': { id: 'task-manager', name: 'Task Manager', icon: 'fa-chart-simple', category: 'System', version: '4.0', description: 'Process monitor', windowId: 'task-manager-window', singleton: true, defaultSize: { w: 560, h: 420 }, minSize: { w: 360, h: 280 }, permissions: ['EXECUTE'], launch: () => typeof openTaskManager === 'function' && openTaskManager() },
      terminal: { id: 'terminal', name: 'Terminal', icon: 'fa-terminal', category: 'Developer', version: '4.0', description: 'Sandboxed Trosmos shell', windowId: 'terminal-window', singleton: false, defaultSize: { w: 720, h: 460 }, minSize: { w: 400, h: 280 }, permissions: ['EXECUTE', 'READ', 'WRITE'], launch: () => openTerminal() },
      calculator: { id: 'calculator', name: 'Calculator', icon: 'fa-calculator', category: 'Utilities', version: '4.0', description: 'Scientific calculator', windowId: 'calculator-window', singleton: true, defaultSize: { w: 340, h: 520 }, minSize: { w: 280, h: 400 }, permissions: ['EXECUTE'], launch: () => openCalculator() },
      notes: { id: 'notes', name: 'Notes', icon: 'fa-note-sticky', category: 'Productivity', version: '4.0', description: 'Persistent notes editor', windowId: 'notes-window', singleton: true, defaultSize: { w: 760, h: 520 }, minSize: { w: 480, h: 320 }, permissions: ['READ', 'WRITE'], launch: () => openNotes() },
      clock: { id: 'clock', name: 'Clock', icon: 'fa-clock', category: 'Utilities', version: '4.0', description: 'Live clock & timezone', windowId: 'clock-window', singleton: true, defaultSize: { w: 380, h: 340 }, minSize: { w: 280, h: 260 }, permissions: ['EXECUTE'], launch: () => openClock() },
      clipboard: { id: 'clipboard', name: 'Clipboard', icon: 'fa-clipboard', category: 'Utilities', version: '4.0', description: 'Clipboard history', windowId: 'clipboard-window', singleton: true, defaultSize: { w: 480, h: 420 }, minSize: { w: 320, h: 280 }, permissions: ['EXECUTE'], launch: () => openClipboard() },
      help: { id: 'help', name: 'Help & About', icon: 'fa-circle-question', category: 'System', version: '4.0', description: 'Keyboard shortcuts & about', windowId: 'help-window', singleton: true, defaultSize: { w: 560, h: 480 }, minSize: { w: 360, h: 320 }, permissions: ['EXECUTE'], launch: () => openHelp() }
    },
    get(id) { return this.apps[id] || null; },
    list() { return Object.values(this.apps); },
    byCategory() {
      const map = {};
      this.list().forEach((a) => {
        if (!map[a.category]) map[a.category] = [];
        map[a.category].push(a);
      });
      return map;
    },
    search(q) {
      const s = String(q || '').toLowerCase().trim();
      if (!s) return this.list();
      return this.list().filter((a) =>
        a.name.toLowerCase().includes(s) ||
        a.description.toLowerCase().includes(s) ||
        a.category.toLowerCase().includes(s) ||
        a.id.includes(s)
      );
    },
    launch(id) {
      const app = this.get(id);
      if (!app) return false;
      try { app.launch(); return true; } catch (e) { console.error('[AppRegistry]', e); return false; }
    }
  };
  window.AppRegistry = AppRegistry;

  /* ---------- Clipboard ---------- */
  const ClipboardManager = {
    history: [],
    max: 30,
    async init() {
      try {
        const rec = await Trosmos.storage?.get('appState', 'clipboard');
        if (rec?.data?.history) this.history = rec.data.history;
      } catch (_) {}
      document.addEventListener('copy', () => setTimeout(() => this.capture(), 60));
      document.addEventListener('cut', () => setTimeout(() => this.capture(), 60));
    },
    async capture() {
      try {
        if (!navigator.clipboard?.readText) return;
        const text = await navigator.clipboard.readText();
        if (!text?.trim()) return;
        if (this.history[0]?.text === text) return;
        this.history.unshift({ id: Date.now(), text: text.slice(0, 4000), time: Date.now() });
        this.history = this.history.slice(0, this.max);
        await Trosmos.storage?.put('appState', { id: 'clipboard', data: { history: this.history } });
        this.render();
      } catch (_) {}
    },
    async copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        Trosmos.notifications?.show('Copied to clipboard', 'success');
      } catch (_) {
        Trosmos.notifications?.show('Clipboard access denied', 'warning');
      }
    },
    clear() {
      this.history = [];
      Trosmos.storage?.put('appState', { id: 'clipboard', data: { history: [] } });
      this.render();
    },
    ensureDOM() {
      if (document.getElementById('clipboard-window')) return;
      const win = document.createElement('div');
      win.id = 'clipboard-window';
      win.setAttribute('role', 'dialog');
      win.setAttribute('aria-label', 'Clipboard Manager');
      win.className =
        'window hidden absolute top-24 left-44 w-[480px] h-[420px] glass-strong rounded-premium overflow-hidden z-50 flex flex-col';
      win.innerHTML =
        '<div class="window-titlebar flex items-center justify-between px-4 py-2.5 border-b border-white/10 cursor-move select-none">' +
        '<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center"><i class="fa-solid fa-clipboard text-white text-xs"></i></div>' +
        '<div class="font-medium text-sm">Clipboard</div></div>' +
        '<div class="window-controls">' +
        '<button type="button" class="window-control minimize" onclick="Trosmos.windows.minimize(\'clipboard-window\')"><i class="fa-solid fa-minus"></i></button>' +
        '<button type="button" class="window-control close" onclick="Trosmos.windows.close(\'clipboard-window\')"><i class="fa-solid fa-xmark"></i></button>' +
        '</div></div>' +
        '<div class="px-4 py-2 border-b border-white/10 flex justify-between items-center">' +
        '<span class="text-xs text-white/50">History</span>' +
        '<button type="button" id="clip-clear-btn" class="text-xs text-rose-300 hover:text-rose-200">Clear all</button></div>' +
        '<div id="clipboard-list" class="flex-1 overflow-y-auto p-3 space-y-2"></div>';
      document.body.appendChild(win);
      registerWin('clipboard-window', win);
      win.querySelector('#clip-clear-btn')?.addEventListener('click', () => this.clear());
    },
    render() {
      const list = document.getElementById('clipboard-list');
      if (!list) return;
      if (!this.history.length) {
        list.innerHTML =
          '<div class="empty-state"><i class="fa-solid fa-clipboard"></i><p>No clipboard history yet.</p></div>';
        return;
      }
      list.innerHTML = this.history
        .map(
          (h) =>
            '<div class="clipboard-item rounded-xl border border-white/10 p-3 cursor-pointer" data-id="' +
            h.id +
            '"><div class="text-sm text-white/90 line-clamp-3 whitespace-pre-wrap">' +
            esc(h.text.slice(0, 280)) +
            '</div><div class="text-[10px] text-white/40 mt-1">' +
            new Date(h.time).toLocaleString() +
            '</div></div>'
        )
        .join('');
      list.querySelectorAll('.clipboard-item').forEach((el) => {
        el.addEventListener('click', () => {
          const item = this.history.find((x) => String(x.id) === el.dataset.id);
          if (item) this.copyText(item.text);
        });
      });
    },
    open() {
      this.ensureDOM();
      this.render();
      focusOrOpen('clipboard-window');
    }
  };

  /* ---------- Terminal ---------- */
  const TerminalApp = {
    cwd: '/Home',
    history: [],
    histIdx: -1,
    ready: false,
    open() {
      this.ensureDOM();
      focusOrOpen('terminal-window');
      if (!this.ready) {
        this.ready = true;
        this.writeln('Trosmos Shell v2.8 — sandboxed virtual environment', 'muted');
        this.writeln('Type <span class="text-cyan-300">help</span> for commands.', 'muted');
        this.writeln('');
      }
      setTimeout(() => document.getElementById('terminal-input')?.focus(), 80);
    },
    ensureDOM() {
      if (document.getElementById('terminal-window')) return;
      const win = document.createElement('div');
      win.id = 'terminal-window';
      win.setAttribute('role', 'dialog');
      win.setAttribute('aria-label', 'Terminal');
      win.className =
        'window hidden absolute top-20 left-36 w-[720px] h-[460px] glass-strong rounded-premium overflow-hidden z-50 flex flex-col';
      win.innerHTML =
        '<div class="window-titlebar flex items-center justify-between px-4 py-2.5 border-b border-white/10 cursor-move select-none">' +
        '<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center"><i class="fa-solid fa-terminal text-white text-xs"></i></div>' +
        '<div><div class="font-medium text-sm">Terminal</div><div class="text-[10px] text-white/40 font-mono">trosmos-shell</div></div></div>' +
        '<div class="window-controls">' +
        '<button type="button" class="window-control minimize" onclick="Trosmos.windows.minimize(\'terminal-window\')"><i class="fa-solid fa-minus"></i></button>' +
        '<button type="button" class="window-control maximize" onclick="Trosmos.windows.maximize(\'terminal-window\')"><i class="fa-regular fa-square"></i></button>' +
        '<button type="button" class="window-control close" onclick="Trosmos.windows.close(\'terminal-window\')"><i class="fa-solid fa-xmark"></i></button>' +
        '</div></div>' +
        '<div id="terminal-output" class="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed text-white/85 bg-black/20"></div>' +
        '<div class="flex items-center gap-2 px-4 py-3 border-t border-white/10 bg-black/30">' +
        '<span id="terminal-prompt" class="font-mono text-emerald-400 text-sm whitespace-nowrap">aria@trosmos:/Home$</span>' +
        '<input id="terminal-input" type="text" autocomplete="off" spellcheck="false" class="flex-1 bg-transparent outline-none font-mono text-sm text-white" aria-label="Terminal input" />' +
        '</div>';
      document.body.appendChild(win);
      registerWin('terminal-window', win);
      document.getElementById('terminal-input').addEventListener('keydown', (e) => this.onKey(e));
    },
    writeln(html, cls) {
      const out = document.getElementById('terminal-output');
      if (!out) return;
      const line = document.createElement('div');
      if (cls === 'muted') line.className = 'text-white/45';
      if (cls === 'error') line.className = 'text-rose-400';
      if (cls === 'ok') line.className = 'text-emerald-400';
      line.innerHTML = html;
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    },
    resolve(p) {
      if (!p || p === '.') return this.cwd;
      if (p === '..') {
        if (this.cwd === '/Home') return '/Home';
        return this.cwd.split('/').slice(0, -1).join('/') || '/Home';
      }
      if (p.startsWith('/')) return p.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      return (this.cwd + '/' + p).replace(/\/+/g, '/');
    },
    updatePrompt() {
      const el = document.getElementById('terminal-prompt');
      if (el) el.textContent = 'aria@trosmos:' + this.cwd + '$';
    },
    onKey(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = e.target.value.trim();
        e.target.value = '';
        if (!cmd) return;
        this.history.push(cmd);
        this.histIdx = this.history.length;
        this.writeln('<span class="text-emerald-400">' + esc(this.cwd) + '</span>$ ' + esc(cmd));
        this.run(cmd);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.histIdx > 0) {
          this.histIdx--;
          e.target.value = this.history[this.histIdx] || '';
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.histIdx < this.history.length - 1) {
          this.histIdx++;
          e.target.value = this.history[this.histIdx] || '';
        } else {
          this.histIdx = this.history.length;
          e.target.value = '';
        }
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        const out = document.getElementById('terminal-output');
        if (out) out.innerHTML = '';
      }
    },
    async run(raw) {
      const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((p) => p.replace(/^"|"$/g, '')) || [];
      const cmd = (parts[0] || '').toLowerCase();
      const args = parts.slice(1);
      const vfs = window.Trosmos?.vfs;
      try {
        switch (cmd) {
          case 'help':
          case '?':
            this.writeln('<span class="text-cyan-300">Trosmos Shell — commands</span>');
            this.writeln('  help, clear, pwd, ls, cd, cat, write, touch, mkdir');
            this.writeln('  rm, mv, cp, echo, whoami, date, uname, neofetch');
            this.writeln('  history, open, apps, processes, settings, system');
            this.writeln('  version, search, notify, exit');
            this.writeln('<span class="text-white/40">Tab completes commands • ↑↓ history • Ctrl+L clear</span>');
            break;
          case 'clear':
          case 'cls': {
            const out = document.getElementById('terminal-output');
            if (out) out.innerHTML = '';
            break;
          }
          case 'pwd':
            this.writeln(esc(this.cwd));
            break;
          case 'ls':
          case 'dir': {
            const items = vfs?.list(this.resolve(args[0] || this.cwd)) || [];
            if (!items.length) this.writeln('(empty)', 'muted');
            items.forEach((f) =>
              this.writeln(
                (f.type === 'folder' ? '📁 ' : '📄 ') +
                  '<span class="' +
                  (f.type === 'folder' ? 'text-cyan-300' : '') +
                  '">' +
                  esc(f.name) +
                  '</span>'
              )
            );
            break;
          }
          case 'cd': {
            const t = this.resolve(args[0] || '/Home');
            if (t === '/Home' || t === '/' || vfs?.exists(t)) {
              const m = vfs?.getFile(t);
              if (t !== '/Home' && m && m.type !== 'folder') this.writeln('cd: not a directory', 'error');
              else {
                this.cwd = t === '/' ? '/Home' : t;
                this.updatePrompt();
              }
            } else this.writeln('cd: no such directory', 'error');
            break;
          }
          case 'cat': {
            if (!args[0]) {
              this.writeln('cat: missing file', 'error');
              break;
            }
            const c = await vfs?.readFile(this.resolve(args[0]));
            if (c == null) this.writeln('cat: not found', 'error');
            else this.writeln(esc(String(c).slice(0, 8000)));
            break;
          }
          case 'touch': {
            if (!args[0]) {
              this.writeln('touch: missing name', 'error');
              break;
            }
            await vfs?.createFile(this.cwd, args[0].split('/').pop(), '');
            this.writeln('created', 'ok');
            if (typeof renderFileManager === 'function') renderFileManager();
            break;
          }
          case 'mkdir': {
            if (!args[0]) {
              this.writeln('mkdir: missing name', 'error');
              break;
            }
            const f = await vfs?.createFolder(this.cwd, args[0]);
            this.writeln(f ? 'created' : 'failed', f ? 'ok' : 'error');
            if (typeof renderFileManager === 'function') renderFileManager();
            break;
          }
          case 'rm': {
            if (!args[0]) {
              this.writeln('rm: missing path', 'error');
              break;
            }
            const p = this.resolve(args[0]);
            if (p === '/Home' || p === '/') {
              this.writeln('cannot remove Home', 'error');
              break;
            }
            const ok = await vfs?.delete(p);
            this.writeln(ok ? 'removed' : 'not found', ok ? 'ok' : 'error');
            if (typeof renderFileManager === 'function') renderFileManager();
            break;
          }
          case 'echo':
            this.writeln(esc(args.join(' ')));
            break;
          case 'whoami':
            this.writeln(esc(Trosmos.settings?.username || 'aria'));
            break;
          case 'date':
            this.writeln(new Date().toString());
            break;
          case 'uname':
          case 'neofetch':
            this.writeln('Trosmos OS ' + OS_VERSION + ' · AI-Native · ' + window.innerWidth + '×' + window.innerHeight);
            break;
          case 'history':
            this.history.forEach((h, i) => this.writeln('  ' + (i + 1) + '  ' + esc(h)));
            break;
          case 'open': {
            const app = (args[0] || '').toLowerCase();
            const map = {
              files: () => typeof openFileManager === 'function' && openFileManager(),
              browser: () => typeof openBrowser === 'function' && openBrowser(),
              settings: () => typeof openSettings === 'function' && openSettings(),
              ai: () => typeof openAIAssistant === 'function' && openAIAssistant(),
              terminal: () => this.open(),
              calc: () => openCalculator(),
              calculator: () => openCalculator(),
              notes: () => openNotes(),
              clock: () => openClock(),
              clipboard: () => openClipboard(),
              help: () => openHelp()
            };
            if (map[app]) {
              map[app]();
              this.writeln('opened', 'ok');
            } else this.writeln('unknown app', 'error');
            break;
          }
          case 'notify':
            Trosmos.notifications?.show(args.join(' ') || 'Hello from Terminal', 'info');
            this.writeln('sent', 'ok');
            break;
          case 'search': {
            const r = vfs?.search(args.join(' ')) || [];
            if (!r.length) this.writeln('No results', 'muted');
            r.slice(0, 15).forEach((x) =>
              this.writeln((x.type === 'folder' ? '📁 ' : '📄 ') + esc(x.path))
            );
            break;
          }
          case 'write': {
            if (args.length < 2) {
              this.writeln('usage: write <file> <content…>', 'error');
              break;
            }
            const wname = args[0].split('/').pop();
            const content = args.slice(1).join(' ');
            await vfs?.createFile(this.cwd, wname, content);
            this.writeln('written ' + esc(wname), 'ok');
            if (typeof renderFileManager === 'function') renderFileManager();
            break;
          }
          case 'mv': {
            if (args.length < 2) {
              this.writeln('usage: mv <src> <dest-parent-or-name>', 'error');
              break;
            }
            const src = this.resolve(args[0]);
            const destArg = args[1];
            // If dest looks like a folder path, move into it; else rename in place
            const destResolved = this.resolve(destArg);
            const destMeta = vfs?.getFile(destResolved);
            if (destMeta && destMeta.type === 'folder') {
              const item = await vfs?.move(src, destResolved);
              this.writeln(item ? 'moved → ' + esc(item.path) : 'mv failed', item ? 'ok' : 'error');
            } else {
              const item = await vfs?.rename(src, destArg.split('/').pop());
              this.writeln(item ? 'renamed → ' + esc(item.path) : 'mv failed', item ? 'ok' : 'error');
            }
            if (typeof renderFileManager === 'function') renderFileManager();
            break;
          }
          case 'cp': {
            if (args.length < 2) {
              this.writeln('usage: cp <src> <new-name>', 'error');
              break;
            }
            const csrc = this.resolve(args[0]);
            const srcFile = vfs?.getFile(csrc);
            if (!srcFile || srcFile.type !== 'file') {
              this.writeln('cp: source not a file', 'error');
              break;
            }
            const content = await vfs?.readFile(csrc);
            const newName = args[1].split('/').pop();
            const created = await vfs?.createFile(this.cwd, newName, content ?? '');
            this.writeln(created ? 'copied → ' + esc(created.path) : 'cp failed', created ? 'ok' : 'error');
            if (typeof renderFileManager === 'function') renderFileManager();
            break;
          }
          case 'find': {
            const q = args.join(' ').trim();
            if (!q) { this.writeln('usage: find <query>'); break; }
            const hits = vfs?.search?.(q) || [];
            if (!hits.length) this.writeln('No matches');
            else hits.slice(0, 40).forEach((f) => this.writeln((f.type === 'folder' ? 'd ' : 'f ') + f.path));
            break;
          }
          case 'reboot':
          case 'restart':
            this.writeln('Restarting Trosmos…');
            setTimeout(() => location.reload(), 400);
            break;
          case 'shutdown':
            this.writeln('Shutting down…');
            setTimeout(() => { if (window.TrosmosEnhance?.PowerMenu) TrosmosEnhance.PowerMenu.action('shutdown'); }, 300);
            break;
          case 'apps': {
            const list = window.AppRegistry?.list?.() || [];
            if (!list.length) this.writeln('(no registry)', 'muted');
            list.forEach((a) => this.writeln('  <span class="text-cyan-300">' + esc(a.id) + '</span>  ' + esc(a.name) + ' · ' + esc(a.category)));
            break;
          }
          case 'processes':
          case 'ps': {
            const procs = Trosmos.processes?.processes;
            if (!procs || procs.size === 0) {
              this.writeln('No tracked processes', 'muted');
            } else {
              this.writeln('PID   STATUS      APP');
              procs.forEach((p) => {
                this.writeln(
                  String(p.pid).padEnd(6) +
                    String(p.status).padEnd(12) +
                    esc(p.appId || p.windowId || '')
                );
              });
            }
            break;
          }
          case 'settings': {
            if (args[0] === 'list' || !args[0]) {
              const s = Trosmos.settings || {};
              Object.keys(s).forEach((k) => this.writeln('  ' + esc(k) + ' = ' + esc(String(s[k]))));
            } else if (args[0] === 'open') {
              if (typeof openSettings === 'function') openSettings();
              this.writeln('opened', 'ok');
            } else {
              this.writeln('usage: settings [list|open]', 'muted');
            }
            break;
          }
          case 'system':
          case 'version': {
            this.writeln('Trosmos OS ' + (typeof OS_VERSION !== 'undefined' ? OS_VERSION : '2.8.0'));
            this.writeln('Shell · sandboxed VFS · ' + window.innerWidth + '×' + window.innerHeight);
            this.writeln('UA: ' + esc((navigator.userAgent || '').slice(0, 80)));
            this.writeln('Online: ' + (navigator.onLine ? 'yes' : 'no'));
            if (performance?.memory) {
              const m = performance.memory;
              this.writeln('JS heap: ' + Math.round(m.usedJSHeapSize / 1048576) + ' / ' + Math.round(m.jsHeapSizeLimit / 1048576) + ' MB (Chrome)');
            }
            break;
          }
          case 'exit':
            Trosmos.windows?.close('terminal-window');
            break;
          default:
            if (cmd) this.writeln('command not found: ' + esc(cmd) + '. Type help.', 'error');
        }
      } catch (err) {
        this.writeln('error: ' + esc(err?.message || err), 'error');
      }
      this.writeln('');
    }
  };

  /* ---------- Calculator ---------- */
  const CalculatorApp = {
    expr: '0',
    justEvaled: false,
    history: [],
    mode: 'basic', // basic | sci
    open() {
      this.ensureDOM();
      this._bindKeys();
      this.renderHistory();
      focusOrOpen('calculator-window');
    },
    ensureDOM() {
      if (document.getElementById('calculator-window')) return;
      const keysBasic = [
        ['C', '⌫', '%', '÷'],
        ['7', '8', '9', '×'],
        ['4', '5', '6', '−'],
        ['1', '2', '3', '+'],
        ['±', '0', '.', '=']
      ];
      const keysSci = [
        ['C', '⌫', '%', '÷'],
        ['√', 'x²', '^', '×'],
        ['sin', 'cos', 'tan', '−'],
        ['log', 'ln', 'π', '+'],
        ['±', '0', '.', '=']
      ];
      const buildPad = (keys) =>
        keys
          .flatMap((row) =>
            row.map((k) => {
              const op = ['÷', '×', '−', '+', '=', '^'].includes(k);
              const sci = ['√', 'x²', 'sin', 'cos', 'tan', 'log', 'ln', 'π'].includes(k);
              const cls = op
                ? 'bg-blue-500/80 hover:bg-blue-400 text-white'
                : k === 'C'
                  ? 'bg-white/10 hover:bg-rose-500/40'
                  : sci
                    ? 'bg-purple-500/30 hover:bg-purple-500/50 text-sm'
                    : 'bg-white/8 hover:bg-white/15';
              return (
                '<button type="button" data-key="' +
                k +
                '" class="calc-btn rounded-2xl font-medium transition-colors ' +
                cls +
                '">' +
                k +
                '</button>'
              );
            })
          )
          .join('');
      const win = document.createElement('div');
      win.id = 'calculator-window';
      win.setAttribute('role', 'dialog');
      win.setAttribute('aria-label', 'Calculator');
      win.className =
        'window hidden absolute top-28 left-1/2 -translate-x-1/2 w-[340px] h-[540px] glass-strong rounded-premium overflow-hidden z-50 flex flex-col';
      win.innerHTML =
        '<div class="window-titlebar flex items-center justify-between px-4 py-2.5 border-b border-white/10 cursor-move select-none">' +
        '<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center"><i class="fa-solid fa-calculator text-white text-xs"></i></div>' +
        '<div class="font-medium text-sm">Calculator</div></div>' +
        '<div class="window-controls">' +
        '<button type="button" class="window-control minimize" aria-label="Minimize" onclick="Trosmos.windows.minimize(\'calculator-window\')"><i class="fa-solid fa-minus"></i></button>' +
        '<button type="button" class="window-control close" aria-label="Close" onclick="Trosmos.windows.close(\'calculator-window\')"><i class="fa-solid fa-xmark"></i></button>' +
        '</div></div>' +
        '<div class="flex-1 flex flex-col p-3 gap-2 min-h-0">' +
        '<div class="flex items-center justify-between gap-2">' +
        '<button type="button" id="calc-mode-btn" class="text-[10px] px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15">Scientific</button>' +
        '<button type="button" id="calc-copy-btn" class="text-[10px] px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15" title="Copy result">Copy</button>' +
        '</div>' +
        '<div id="calc-display" class="h-14 rounded-2xl bg-black/30 flex items-end justify-end px-4 py-2 font-mono text-2xl text-white tracking-tight overflow-x-auto" aria-live="polite">0</div>' +
        '<div id="calc-history" class="h-12 overflow-y-auto text-[11px] text-white/40 font-mono px-1 space-y-0.5"></div>' +
        '<div class="grid grid-cols-4 gap-1.5 flex-1" id="calc-pad">' +
        buildPad(keysBasic) +
        '</div></div>';
      document.body.appendChild(win);
      registerWin('calculator-window', win);
      win.querySelector('#calc-pad').addEventListener('click', (e) => {
        const b = e.target.closest('[data-key]');
        if (b) this.press(b.dataset.key);
      });
      win.querySelector('#calc-mode-btn')?.addEventListener('click', () => {
        this.mode = this.mode === 'basic' ? 'sci' : 'basic';
        const pad = win.querySelector('#calc-pad');
        pad.innerHTML = buildPad(this.mode === 'sci' ? keysSci : keysBasic);
        win.querySelector('#calc-mode-btn').textContent = this.mode === 'sci' ? 'Basic' : 'Scientific';
      });
      win.querySelector('#calc-copy-btn')?.addEventListener('click', () => {
        const t = this.expr === 'Error' ? '' : this.expr;
        if (t && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(t);
          Trosmos.notifications?.show('Result copied', 'success');
        }
      });
    },
    renderHistory() {
      const el = document.getElementById('calc-history');
      if (!el) return;
      el.innerHTML = this.history
        .slice(0, 6)
        .map((h) => '<div class="truncate cursor-pointer hover:text-white/70" data-hist="' + esc(h.result) + '">' + esc(h.expr) + ' = ' + esc(h.result) + '</div>')
        .join('');
      el.querySelectorAll('[data-hist]').forEach((n) => {
        n.addEventListener('click', () => {
          this.expr = n.getAttribute('data-hist') || '0';
          this.justEvaled = true;
          const d = document.getElementById('calc-display');
          if (d) d.textContent = this.expr;
        });
      });
    },
    press(key) {
      if (key === 'C') {
        this.expr = '0';
        this.justEvaled = false;
      } else if (key === '⌫' || key === 'Backspace') {
        this.expr = this.expr.length <= 1 ? '0' : this.expr.slice(0, -1);
      } else if (key === '±') {
        if (this.expr === 'Error') this.expr = '0';
        else if (this.expr.startsWith('-')) this.expr = this.expr.slice(1) || '0';
        else if (this.expr !== '0') this.expr = '-' + this.expr;
      } else if (key === '%') {
        try {
          this.expr = this._format(this._eval(this.expr) / 100);
          this.justEvaled = true;
        } catch (_) {
          this.expr = 'Error';
          this.justEvaled = true;
        }
      } else if (key === 'π') {
        if (this.justEvaled || this.expr === '0' || this.expr === 'Error') {
          this.expr = String(Math.PI);
          this.justEvaled = false;
        } else this.expr += String(Math.PI);
      } else if (['√', 'x²', 'sin', 'cos', 'tan', 'log', 'ln'].includes(key)) {
        try {
          const v = this._eval(this.expr);
          let r;
          if (key === '√') r = Math.sqrt(v);
          else if (key === 'x²') r = v * v;
          else if (key === 'sin') r = Math.sin(v);
          else if (key === 'cos') r = Math.cos(v);
          else if (key === 'tan') r = Math.tan(v);
          else if (key === 'log') r = Math.log10(v);
          else if (key === 'ln') r = Math.log(v);
          const prev = this.expr;
          this.expr = this._format(r);
          this.history.unshift({ expr: key + '(' + prev + ')', result: this.expr });
          this.history = this.history.slice(0, 20);
          this.renderHistory();
          this.justEvaled = true;
        } catch (_) {
          this.expr = 'Error';
          this.justEvaled = true;
        }
      } else if (key === '=' || key === 'Enter') {
        try {
          const prev = this.expr;
          this.expr = this._format(this._eval(this.expr));
          this.history.unshift({ expr: prev, result: this.expr });
          this.history = this.history.slice(0, 20);
          this.renderHistory();
          this.justEvaled = true;
        } catch (_) {
          this.expr = 'Error';
          this.justEvaled = true;
        }
      } else if (['+', '−', '×', '÷', '*', '/', '^'].includes(key)) {
        const map = { '*': '×', '/': '÷', '-': '−' };
        const op = map[key] || key;
        this.justEvaled = false;
        const last = this.expr.slice(-1);
        if (['+', '−', '×', '÷', '^'].includes(last)) this.expr = this.expr.slice(0, -1) + op;
        else if (this.expr === 'Error') this.expr = '0' + op;
        else this.expr += op;
      } else if (/^[0-9.]$/.test(key)) {
        if (this.justEvaled || this.expr === '0' || this.expr === 'Error') {
          this.expr = key === '.' ? '0.' : key;
          this.justEvaled = false;
        } else if (key === '.' && /\.\d*$/.test(this.expr.split(/[+\u2212\u00d7\u00f7^]/).pop() || '')) {
          /* ignore second decimal */
        } else {
          this.expr += key;
        }
      }
      const el = document.getElementById('calc-display');
      if (el) el.textContent = this.expr;
    },
    _format(n) {
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('nan');
      return String(+n.toPrecision(12));
    },
    /**
     * Safe arithmetic evaluator (no Function / eval — CSP-safe).
     * Supports + − × ÷ ^, unary minus, decimals, parentheses.
     */
    _eval(raw) {
      const src = String(raw)
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-')
        .replace(/\s+/g, '');
      if (!src) throw new Error('empty');

      let i = 0;
      const peek = () => src[i];
      const next = () => src[i++];

      const parseNumber = () => {
        let start = i;
        if (peek() === '.') i++;
        while (peek() && /[0-9]/.test(peek())) i++;
        if (peek() === '.') {
          i++;
          while (peek() && /[0-9]/.test(peek())) i++;
        }
        const slice = src.slice(start, i);
        if (!slice || slice === '.') throw new Error('bad number');
        const n = Number(slice);
        if (!Number.isFinite(n)) throw new Error('bad number');
        return n;
      };

      const parseFactor = () => {
        if (peek() === '+') {
          next();
          return parseFactor();
        }
        if (peek() === '-') {
          next();
          return -parseFactor();
        }
        if (peek() === '(') {
          next();
          const v = parseExpression();
          if (peek() !== ')') throw new Error('paren');
          next();
          return v;
        }
        if (peek() && /[0-9.]/.test(peek())) return parseNumber();
        throw new Error('factor');
      };

      // power has higher precedence (right-assoc)
      const parsePower = () => {
        let v = parseFactor();
        if (peek() === '^') {
          next();
          const r = parsePower();
          v = Math.pow(v, r);
        }
        return v;
      };

      const parseTerm = () => {
        let v = parsePower();
        while (peek() === '*' || peek() === '/') {
          const op = next();
          const r = parsePower();
          if (op === '*') v *= r;
          else {
            if (r === 0) throw new Error('div0');
            v /= r;
          }
        }
        return v;
      };

      const parseExpression = () => {
        let v = parseTerm();
        while (peek() === '+' || peek() === '-') {
          const op = next();
          const r = parseTerm();
          v = op === '+' ? v + r : v - r;
        }
        return v;
      };

      const result = parseExpression();
      if (i !== src.length) throw new Error('trailing');
      if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('nan');
      return result;
    },
    _onKey(e) {
      const win = document.getElementById('calculator-window');
      if (!win || win.classList.contains('hidden')) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const k = e.key;
      if (k === 'Escape') {
        if (window.Trosmos?.windows?.close) Trosmos.windows.close('calculator-window');
        return;
      }
      const map = {
        Enter: '=',
        '=': '=',
        Backspace: '⌫',
        Delete: 'C',
        c: 'C',
        C: 'C',
        '%': '%',
        '+': '+',
        '-': '−',
        '*': '×',
        '/': '÷',
        x: '×',
        X: '×',
        '^': '^'
      };
      let key = map[k];
      if (!key && /^[0-9.]$/.test(k)) key = k;
      if (!key) return;
      e.preventDefault();
      this.press(key);
    },
    _bindKeys() {
      if (this._keysBound) return;
      this._keysBound = true;
      document.addEventListener('keydown', (e) => this._onKey(e));
    }
  };

  /* ---------- Notes ---------- */
  const NotesApp = {
    notes: [],
    current: null,
    async init() {
      try {
        const rec = await Trosmos.storage?.get('appState', 'notes');
        if (rec?.data?.notes?.length) this.notes = rec.data.notes;
        else
          this.notes = [
            {
              id: 1,
              title: 'Welcome',
              body: 'Your notes persist across sessions.\n\nClick + New note to create more.\nUse Save to Files to store in the virtual filesystem under /Home/Notes.',
              modified: Date.now()
            }
          ];
      } catch (_) {
        this.notes = [{ id: 1, title: 'Welcome', body: 'Your notes live here.', modified: Date.now() }];
      }
      // Ensure /Home/Notes folder exists for VFS integration
      try {
        const vfs = Trosmos?.vfs;
        if (vfs && !vfs.exists('/Home/Notes')) {
          await vfs.createFolder('/Home', 'Notes');
        }
      } catch (_) {}
    },
    async persist() {
      await Trosmos.storage?.put('appState', { id: 'notes', data: { notes: this.notes } });
    },
    async saveToVFS() {
      this.saveCurrent();
      const n = this.notes.find((x) => x.id === this.current);
      if (!n) return;
      const vfs = Trosmos?.vfs;
      if (!vfs) {
        Trosmos.notifications?.show('Filesystem unavailable', 'warning');
        return;
      }
      if (!vfs.exists('/Home/Notes')) await vfs.createFolder('/Home', 'Notes');
      const safe = (n.title || 'Untitled').replace(/[^\w\s.\-]/g, '').trim() || 'Untitled';
      const name = safe.endsWith('.md') ? safe : safe + '.md';
      await vfs.createFile('/Home/Notes', name, n.body || '', 'text/markdown');
      Trosmos.notifications?.show('Saved to /Home/Notes/' + name, 'success');
      if (typeof renderFileManager === 'function') renderFileManager();
    },
    open() {
      this.ensureDOM();
      this.renderList();
      if (this.notes[0]) this.select(this.notes[0].id);
      focusOrOpen('notes-window');
    },
    ensureDOM() {
      if (document.getElementById('notes-window')) return;
      const win = document.createElement('div');
      win.id = 'notes-window';
      win.setAttribute('role', 'dialog');
      win.setAttribute('aria-label', 'Notes');
      win.className =
        'window hidden absolute top-20 left-40 w-[760px] h-[520px] glass-strong rounded-premium overflow-hidden z-50 flex flex-col';
      win.innerHTML =
        '<div class="window-titlebar flex items-center justify-between px-4 py-2.5 border-b border-white/10 cursor-move select-none">' +
        '<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center"><i class="fa-solid fa-note-sticky text-white text-xs"></i></div>' +
        '<div class="font-medium text-sm">Notes</div></div>' +
        '<div class="window-controls">' +
        '<button type="button" class="window-control minimize" onclick="Trosmos.windows.minimize(\'notes-window\')"><i class="fa-solid fa-minus"></i></button>' +
        '<button type="button" class="window-control maximize" onclick="Trosmos.windows.maximize(\'notes-window\')"><i class="fa-regular fa-square"></i></button>' +
        '<button type="button" class="window-control close" onclick="Trosmos.windows.close(\'notes-window\')"><i class="fa-solid fa-xmark"></i></button>' +
        '</div></div>' +
        '<div class="flex flex-1 min-h-0">' +
        '<div class="w-56 border-r border-white/10 flex flex-col">' +
        '<div class="p-3 space-y-2"><button type="button" id="notes-new-btn" class="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm">+ New note</button>' +
        '<button type="button" id="notes-vfs-btn" class="w-full py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-sm text-blue-200">Save to Files</button></div>' +
        '<div id="notes-list" class="flex-1 overflow-y-auto px-2 pb-2 space-y-1"></div></div>' +
        '<div class="flex-1 flex flex-col min-w-0">' +
        '<input id="notes-title" class="bg-transparent px-5 py-3 text-lg font-medium outline-none border-b border-white/10" placeholder="Title" />' +
        '<textarea id="notes-body" class="flex-1 bg-transparent p-5 text-sm outline-none resize-none leading-relaxed text-white/90" placeholder="Start writing…"></textarea>' +
        '</div></div>';
      document.body.appendChild(win);
      registerWin('notes-window', win);
      win.querySelector('#notes-new-btn')?.addEventListener('click', () => this.create());
      win.querySelector('#notes-vfs-btn')?.addEventListener('click', () => this.saveToVFS());
      document.getElementById('notes-title').addEventListener('input', () => this.saveCurrent());
      document.getElementById('notes-body').addEventListener('input', () => this.saveCurrent());
      // Ctrl+S to save to VFS when notes focused
      win.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          this.saveToVFS();
        }
      });
    },
    renderList() {
      const list = document.getElementById('notes-list');
      if (!list) return;
      list.innerHTML = this.notes
        .map((n) => {
          const active = this.current === n.id ? 'active' : '';
          return (
            '<button type="button" class="notes-item w-full text-left px-3 py-2 rounded-xl border border-transparent text-sm ' +
            active +
            '" data-id="' +
            n.id +
            '"><div class="font-medium truncate">' +
            esc(n.title || 'Untitled') +
            '</div><div class="text-[10px] text-white/40 truncate">' +
            esc((n.body || '').slice(0, 60)) +
            '</div></button>'
          );
        })
        .join('');
      list.querySelectorAll('.notes-item').forEach((el) => {
        el.addEventListener('click', () => this.select(Number(el.dataset.id)));
      });
    },
    select(id) {
      this.saveCurrent();
      this.current = id;
      const n = this.notes.find((x) => x.id === id);
      if (!n) return;
      document.getElementById('notes-title').value = n.title || '';
      document.getElementById('notes-body').value = n.body || '';
      this.renderList();
    },
    saveCurrent() {
      if (this.current == null) return;
      const n = this.notes.find((x) => x.id === this.current);
      if (!n) return;
      n.title = document.getElementById('notes-title')?.value || 'Untitled';
      n.body = document.getElementById('notes-body')?.value || '';
      n.modified = Date.now();
      this.persist();
    },
    create() {
      this.saveCurrent();
      const id = Date.now();
      this.notes.unshift({ id: id, title: 'New note', body: '', modified: Date.now() });
      this.persist();
      this.select(id);
    }
  };

  /* ---------- Clock ---------- */
  const ClockApp = {
    timer: null,
    mode: 'clock', // clock | stopwatch | timer
    swRunning: false,
    swStart: 0,
    swAcc: 0,
    swInterval: null,
    timerRemaining: 0,
    timerInterval: null,
    open() {
      this.ensureDOM();
      focusOrOpen('clock-window');
      this.tick();
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 1000);
    },
    ensureDOM() {
      if (document.getElementById('clock-window')) return;
      const win = document.createElement('div');
      win.id = 'clock-window';
      win.setAttribute('role', 'dialog');
      win.setAttribute('aria-label', 'Clock');
      win.className =
        'window hidden absolute top-24 left-1/2 -translate-x-1/2 w-[400px] h-[420px] glass-strong rounded-premium overflow-hidden z-50 flex flex-col';
      win.innerHTML =
        '<div class="window-titlebar flex items-center justify-between px-4 py-2.5 border-b border-white/10 cursor-move select-none">' +
        '<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center"><i class="fa-solid fa-clock text-white text-xs"></i></div>' +
        '<div class="font-medium text-sm">Clock</div></div>' +
        '<div class="window-controls">' +
        '<button type="button" class="window-control minimize" onclick="Trosmos.windows.minimize(\'clock-window\')"><i class="fa-solid fa-minus"></i></button>' +
        '<button type="button" class="window-control close" onclick="Trosmos.windows.close(\'clock-window\')"><i class="fa-solid fa-xmark"></i></button>' +
        '</div></div>' +
        '<div class="flex gap-1 px-3 pt-3" role="tablist">' +
        '<button type="button" data-clock-tab="clock" class="clock-tab flex-1 py-2 rounded-xl text-xs bg-white/10">Clock</button>' +
        '<button type="button" data-clock-tab="stopwatch" class="clock-tab flex-1 py-2 rounded-xl text-xs text-white/50 hover:bg-white/5">Stopwatch</button>' +
        '<button type="button" data-clock-tab="timer" class="clock-tab flex-1 py-2 rounded-xl text-xs text-white/50 hover:bg-white/5">Timer</button>' +
        '</div>' +
        '<div class="flex-1 flex flex-col items-center justify-center gap-2 px-4" id="clock-panel">' +
        '<div id="clock-big" class="text-5xl font-display font-semibold tracking-tight tabular-nums">--:--:--</div>' +
        '<div id="clock-full" class="text-white/50 text-sm"></div>' +
        '<div class="mt-6 grid grid-cols-2 gap-3 w-full px-4">' +
        '<div class="glass rounded-2xl p-4 text-center"><div class="text-xs text-white/40 mb-1">Timezone</div><div id="clock-tz" class="text-sm font-medium">—</div></div>' +
        '<div class="glass rounded-2xl p-4 text-center"><div class="text-xs text-white/40 mb-1">UTC Offset</div><div id="clock-offset" class="text-sm font-medium">—</div></div>' +
        '</div></div>';
      document.body.appendChild(win);
      registerWin('clock-window', win);
      win.querySelectorAll('[data-clock-tab]').forEach((btn) => {
        btn.addEventListener('click', () => this.setMode(btn.dataset.clockTab));
      });
    },
    setMode(mode) {
      this.mode = mode;
      const win = document.getElementById('clock-window');
      if (!win) return;
      win.querySelectorAll('[data-clock-tab]').forEach((b) => {
        const on = b.dataset.clockTab === mode;
        b.className = 'clock-tab flex-1 py-2 rounded-xl text-xs ' + (on ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5');
      });
      const panel = document.getElementById('clock-panel');
      if (!panel) return;
      if (mode === 'clock') {
        panel.innerHTML =
          '<div id="clock-big" class="text-5xl font-display font-semibold tracking-tight tabular-nums">--:--:--</div>' +
          '<div id="clock-full" class="text-white/50 text-sm"></div>' +
          '<div class="mt-6 grid grid-cols-2 gap-3 w-full px-4">' +
          '<div class="glass rounded-2xl p-4 text-center"><div class="text-xs text-white/40 mb-1">Timezone</div><div id="clock-tz" class="text-sm font-medium">—</div></div>' +
          '<div class="glass rounded-2xl p-4 text-center"><div class="text-xs text-white/40 mb-1">UTC Offset</div><div id="clock-offset" class="text-sm font-medium">—</div></div></div>';
        this.tick();
      } else if (mode === 'stopwatch') {
        panel.innerHTML =
          '<div id="sw-display" class="text-5xl font-display font-semibold tracking-tight tabular-nums">00:00.00</div>' +
          '<div class="flex gap-2 mt-6">' +
          '<button type="button" id="sw-start" class="px-5 py-2.5 rounded-xl bg-emerald-500/80 hover:bg-emerald-400 text-sm font-medium min-h-[44px]">Start</button>' +
          '<button type="button" id="sw-reset" class="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm min-h-[44px]">Reset</button></div>';
        panel.querySelector('#sw-start')?.addEventListener('click', () => this.toggleStopwatch());
        panel.querySelector('#sw-reset')?.addEventListener('click', () => this.resetStopwatch());
        this.renderStopwatch();
      } else {
        panel.innerHTML =
          '<div id="tm-display" class="text-5xl font-display font-semibold tracking-tight tabular-nums">05:00</div>' +
          '<div class="flex gap-2 mt-4 flex-wrap justify-center">' +
          '<button type="button" data-tm="60" class="px-3 py-2 rounded-xl bg-white/10 text-xs min-h-[40px]">1m</button>' +
          '<button type="button" data-tm="300" class="px-3 py-2 rounded-xl bg-white/10 text-xs min-h-[40px]">5m</button>' +
          '<button type="button" data-tm="600" class="px-3 py-2 rounded-xl bg-white/10 text-xs min-h-[40px]">10m</button>' +
          '<button type="button" data-tm="1500" class="px-3 py-2 rounded-xl bg-white/10 text-xs min-h-[40px]">25m</button></div>' +
          '<div class="flex gap-2 mt-4">' +
          '<button type="button" id="tm-start" class="px-5 py-2.5 rounded-xl bg-sky-500/80 hover:bg-sky-400 text-sm font-medium min-h-[44px]">Start</button>' +
          '<button type="button" id="tm-reset" class="px-5 py-2.5 rounded-xl bg-white/10 text-sm min-h-[44px]">Reset</button></div>';
        if (!this.timerRemaining) this.timerRemaining = 300;
        this.renderTimer();
        panel.querySelectorAll('[data-tm]').forEach((b) =>
          b.addEventListener('click', () => {
            this.stopTimer();
            this.timerRemaining = Number(b.dataset.tm);
            this.renderTimer();
          })
        );
        panel.querySelector('#tm-start')?.addEventListener('click', () => this.toggleTimer());
        panel.querySelector('#tm-reset')?.addEventListener('click', () => {
          this.stopTimer();
          this.timerRemaining = 300;
          this.renderTimer();
        });
      }
    },
    fmtMs(ms) {
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      const cs = Math.floor((ms % 1000) / 10);
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
    },
    fmtSec(sec) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    },
    toggleStopwatch() {
      const btn = document.getElementById('sw-start');
      if (this.swRunning) {
        this.swAcc += performance.now() - this.swStart;
        this.swRunning = false;
        clearInterval(this.swInterval);
        if (btn) btn.textContent = 'Start';
      } else {
        this.swStart = performance.now();
        this.swRunning = true;
        this.swInterval = setInterval(() => this.renderStopwatch(), 30);
        if (btn) btn.textContent = 'Stop';
      }
    },
    resetStopwatch() {
      this.swRunning = false;
      clearInterval(this.swInterval);
      this.swAcc = 0;
      this.swStart = 0;
      const btn = document.getElementById('sw-start');
      if (btn) btn.textContent = 'Start';
      this.renderStopwatch();
    },
    renderStopwatch() {
      const el = document.getElementById('sw-display');
      if (!el) return;
      let ms = this.swAcc;
      if (this.swRunning) ms += performance.now() - this.swStart;
      el.textContent = this.fmtMs(ms);
    },
    toggleTimer() {
      const btn = document.getElementById('tm-start');
      if (this.timerInterval) {
        this.stopTimer();
        if (btn) btn.textContent = 'Start';
        return;
      }
      if (this.timerRemaining <= 0) this.timerRemaining = 300;
      if (btn) btn.textContent = 'Pause';
      this.timerInterval = setInterval(() => {
        this.timerRemaining -= 1;
        this.renderTimer();
        if (this.timerRemaining <= 0) {
          this.stopTimer();
          if (btn) btn.textContent = 'Start';
          Trosmos.notifications?.show('Timer finished', 'success');
          try {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          } catch (_) {}
        }
      }, 1000);
    },
    stopTimer() {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
      const btn = document.getElementById('tm-start');
      if (btn) btn.textContent = 'Start';
    },
    renderTimer() {
      const el = document.getElementById('tm-display');
      if (el) el.textContent = this.fmtSec(Math.max(0, this.timerRemaining));
    },
    tick() {
      if (this.mode !== 'clock') return;
      const now = new Date();
      const el = document.getElementById('clock-big');
      if (!el) return;
      el.textContent = now.toLocaleTimeString([], { hour12: false });
      const full = document.getElementById('clock-full');
      if (full)
        full.textContent = now.toLocaleDateString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      const tz = document.getElementById('clock-tz');
      if (tz) tz.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
      const off = document.getElementById('clock-offset');
      if (off) {
        const m = -now.getTimezoneOffset();
        off.textContent =
          'UTC' + (m >= 0 ? '+' : '') + Math.floor(m / 60) + ':' + String(Math.abs(m % 60)).padStart(2, '0');
      }
    }
  };

  /* ---------- Help ---------- */
  const HelpApp = {
    open() {
      this.ensureDOM();
      focusOrOpen('help-window');
    },
    ensureDOM() {
      if (document.getElementById('help-window')) return;
      const win = document.createElement('div');
      win.id = 'help-window';
      win.setAttribute('role', 'dialog');
      win.setAttribute('aria-label', 'Help');
      win.className =
        'window hidden absolute top-24 left-1/2 -translate-x-1/2 w-[560px] h-[480px] glass-strong rounded-premium overflow-hidden z-50 flex flex-col';
      win.innerHTML =
        '<div class="window-titlebar flex items-center justify-between px-4 py-2.5 border-b border-white/10 cursor-move select-none">' +
        '<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center"><i class="fa-solid fa-circle-question text-white text-xs"></i></div>' +
        '<div class="font-medium text-sm">Help & About</div></div>' +
        '<div class="window-controls"><button type="button" class="window-control close" onclick="Trosmos.windows.close(\'help-window\')"><i class="fa-solid fa-xmark"></i></button></div></div>' +
        '<div class="flex-1 overflow-y-auto p-6 space-y-5 text-sm text-white/80 leading-relaxed">' +
        '<div><h3 class="text-lg font-semibold text-white mb-1">Trosmos OS 2.8</h3>' +
        '<p class="text-white/50">Premium AI-native operating system — evolved desktop environment.</p></div>' +
        '<div><h4 class="font-medium text-white mb-2">Keyboard shortcuts</h4><ul class="space-y-1 text-white/60">' +
        '<li><kbd class="px-1.5 py-0.5 rounded bg-white/10 text-xs">Ctrl+K</kbd> Command palette / system search</li>' +
        '<li><kbd class="px-1.5 py-0.5 rounded bg-white/10 text-xs">Ctrl+T</kbd> Terminal</li>' +
        '<li><kbd class="px-1.5 py-0.5 rounded bg-white/10 text-xs">Ctrl+L</kbd> Lock screen</li>' +
        '<li><kbd class="px-1.5 py-0.5 rounded bg-white/10 text-xs">Ctrl+S</kbd> Save note to Files (in Notes)</li>' +
        '<li><kbd class="px-1.5 py-0.5 rounded bg-white/10 text-xs">Esc</kbd> Close overlays</li></ul></div>' +
        '<div><h4 class="font-medium text-white mb-2">Built-in apps</h4>' +
        '<p>AI, Files, Browser, Terminal, Calculator (scientific), Notes (VFS), Clock, Clipboard, Settings, App Store, Task Manager.</p></div>' +
        '<div><h4 class="font-medium text-white mb-2">Terminal</h4>' +
        '<p class="text-white/60">Full sandboxed shell: ls, cd, cat, write, mkdir, rm, mv, cp, apps, processes, system, search, open…</p></div>' +
        '<div class="text-white/40 text-xs pt-2 border-t border-white/10">Files persist via IndexedDB. AI requires Netlify + GEMINI_API_KEY. AppRegistry unifies launchers.</div></div>';
      document.body.appendChild(win);
      registerWin('help-window', win);
    }
  };

  /* ---------- Lock screen ---------- */
  function ensureLockScreen() {
    if (document.getElementById('lock-screen')) return;
    const el = document.createElement('div');
    el.id = 'lock-screen';
    el.className = 'lock-screen hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Lock screen');
    el.innerHTML =
      '<div class="text-center mb-10">' +
      '<div id="lock-clock" class="text-6xl font-display font-semibold tracking-tight mb-2">--:--</div>' +
      '<div id="lock-date" class="text-white/60 text-lg">—</div></div>' +
      '<div class="glass rounded-3xl p-8 w-[360px] max-w-[90vw] text-center">' +
      '<div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#7C3AED] flex items-center justify-center text-2xl font-bold">A</div>' +
      '<div class="font-medium mb-1">Aria</div>' +
      '<div class="text-sm text-white/50 mb-5">Session locked</div>' +
      '<input id="lock-pin" type="password" placeholder="Press Enter to unlock" class="w-full bg-white/5 border border-white/15 rounded-2xl px-4 py-3 text-sm text-center focus:outline-none focus:border-white/30 mb-4" aria-label="Unlock" />' +
      '<button type="button" id="lock-unlock-btn" class="w-full py-3 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-medium transition-colors">Unlock</button></div>';
    document.body.appendChild(el);
    el.querySelector('#lock-unlock-btn')?.addEventListener('click', unlockSystem);
    el.querySelector('#lock-pin')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') unlockSystem();
    });
  }

  function lockSystem() {
    ensureLockScreen();
    const lock = document.getElementById('lock-screen');
    const tick = () => {
      const now = new Date();
      const c = document.getElementById('lock-clock');
      const d = document.getElementById('lock-date');
      if (c) c.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (d)
        d.textContent = now.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        });
    };
    tick();
    if (lock._timer) clearInterval(lock._timer);
    lock._timer = setInterval(tick, 1000);
    lock.classList.remove('hidden');
    setTimeout(() => document.getElementById('lock-pin')?.focus(), 100);
  }

  function unlockSystem() {
    const lock = document.getElementById('lock-screen');
    if (!lock) return;
    if (lock._timer) clearInterval(lock._timer);
    lock.classList.add('hidden');
    const pin = document.getElementById('lock-pin');
    if (pin) pin.value = '';
    Trosmos.notifications?.show('Welcome back', 'success');
  }

  /* ---------- Window resize enhancement ---------- */
  function enhanceWindowResize() {
    const WM = window.Trosmos?.windows;
    if (!WM || WM.makeResizable) return;
    WM.makeResizable = function (win) {
      if (!win || win.dataset.resizable === '1') return;
      win.dataset.resizable = '1';
      ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach((dir) => {
        const h = document.createElement('div');
        h.className = 'window-resize-handle ' + dir;
        h.dataset.dir = dir;
        win.appendChild(h);
      });
      win.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('.window-resize-handle');
        if (!handle || win.classList.contains('maximized')) return;
        if (window.matchMedia('(max-width: 768px)').matches) return;
        e.preventDefault();
        e.stopPropagation();
        const dir = handle.dataset.dir;
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = win.getBoundingClientRect();
        const orig = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          let x = orig.x,
            y = orig.y,
            w = orig.w,
            h = orig.h;
          if (dir.includes('e')) w = Math.max(320, orig.w + dx);
          if (dir.includes('s')) h = Math.max(200, orig.h + dy);
          if (dir.includes('w')) {
            w = Math.max(320, orig.w - dx);
            x = orig.x + (orig.w - w);
          }
          if (dir.includes('n')) {
            h = Math.max(200, orig.h - dy);
            y = orig.y + (orig.h - h);
          }
          win.style.left = x + 'px';
          win.style.top = y + 'px';
          win.style.width = w + 'px';
          win.style.height = h + 'px';
          win.style.transform = 'none';
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          if (typeof this.saveState === 'function') this.saveState(win.id);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp, { once: true });
      });
    };
    const origRegister = WM.register.bind(WM);
    WM.register = function (id, el) {
      origRegister(id, el);
      this.makeResizable(el);
    };
    document.querySelectorAll('.window').forEach((w) => WM.makeResizable(w));
  }

  /* ---------- Public API ---------- */
  function openTerminal() {
    TerminalApp.open();
  }
  function openCalculator() {
    CalculatorApp.open();
  }
  function openNotes() {
    NotesApp.open();
  }
  function openClock() {
    ClockApp.open();
  }
  function openClipboard() {
    ClipboardManager.open();
  }
  function openHelp() {
    HelpApp.open();
  }

  window.openTerminal = openTerminal;
  window.openCalculator = openCalculator;
  window.openNotes = openNotes;
  window.openClock = openClock;
  window.openClipboard = openClipboard;
  window.openHelp = openHelp;
  window.lockSystem = lockSystem;
  window.unlockSystem = unlockSystem;
  window.TerminalApp = TerminalApp;
  window.CalculatorApp = CalculatorApp;
  window.NotesApp = NotesApp;
  window.ClockApp = ClockApp;
  window.ClipboardManager = ClipboardManager;
  window.HelpApp = HelpApp;

  function bootApps() {
    enhanceWindowResize();
    ensureLockScreen();
    NotesApp.init();
    ClipboardManager.init();

    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't' && !e.shiftKey && !typing) {
        e.preventDefault();
        openTerminal();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && !e.shiftKey && !typing) {
        e.preventDefault();
        lockSystem();
      }
    });

    console.log('%c[Trosmos] Apps extension v4.0 loaded', 'color:#10B981');
  }

  if (document.readyState === 'complete') {
    setTimeout(bootApps, 200);
  } else {
    window.addEventListener('load', () => setTimeout(bootApps, 200));
  }
})();
