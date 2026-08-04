/**
 * Trosmos OS 2.7 — Built-in Applications Extension
 * Loaded after the core OS script. Expects global Trosmos, escapeHtml.
 */
(function () {
  'use strict';

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
      if (w) w.classList.remove('hidden');
    }
  }

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
        this.writeln('Trosmos Shell v2.7 — sandboxed virtual environment', 'muted');
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
            this.writeln(
              'Commands: help clear pwd ls cd cat touch mkdir rm echo whoami date uname history neofetch open notify search'
            );
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
            this.writeln('Trosmos OS 2.7 · AI-Native · ' + window.innerWidth + '×' + window.innerHeight);
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
    open() {
      this.ensureDOM();
      focusOrOpen('calculator-window');
    },
    ensureDOM() {
      if (document.getElementById('calculator-window')) return;
      const keys = [
        ['C', '⌫', '%', '÷'],
        ['7', '8', '9', '×'],
        ['4', '5', '6', '−'],
        ['1', '2', '3', '+'],
        ['±', '0', '.', '=']
      ];
      const pad = keys
        .flatMap((row) =>
          row.map((k) => {
            const op = ['÷', '×', '−', '+', '='].includes(k);
            const cls = op
              ? 'bg-blue-500/80 hover:bg-blue-400 text-white'
              : k === 'C'
                ? 'bg-white/10 hover:bg-rose-500/40'
                : 'bg-white/8 hover:bg-white/15';
            return (
              '<button type="button" data-key="' +
              k +
              '" class="calc-btn rounded-2xl text-lg font-medium transition-colors ' +
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
        'window hidden absolute top-28 left-1/2 -translate-x-1/2 w-[320px] h-[480px] glass-strong rounded-premium overflow-hidden z-50 flex flex-col';
      win.innerHTML =
        '<div class="window-titlebar flex items-center justify-between px-4 py-2.5 border-b border-white/10 cursor-move select-none">' +
        '<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center"><i class="fa-solid fa-calculator text-white text-xs"></i></div>' +
        '<div class="font-medium text-sm">Calculator</div></div>' +
        '<div class="window-controls">' +
        '<button type="button" class="window-control minimize" onclick="Trosmos.windows.minimize(\'calculator-window\')"><i class="fa-solid fa-minus"></i></button>' +
        '<button type="button" class="window-control close" onclick="Trosmos.windows.close(\'calculator-window\')"><i class="fa-solid fa-xmark"></i></button>' +
        '</div></div>' +
        '<div class="flex-1 flex flex-col p-4 gap-3">' +
        '<div id="calc-display" class="h-16 rounded-2xl bg-black/30 flex items-end justify-end px-4 py-3 font-mono text-3xl text-white tracking-tight overflow-x-auto" aria-live="polite">0</div>' +
        '<div class="grid grid-cols-4 gap-2 flex-1" id="calc-pad">' +
        pad +
        '</div></div>';
      document.body.appendChild(win);
      registerWin('calculator-window', win);
      win.querySelector('#calc-pad').addEventListener('click', (e) => {
        const b = e.target.closest('[data-key]');
        if (b) this.press(b.dataset.key);
      });
    },
    press(key) {
      if (key === 'C') {
        this.expr = '0';
        this.justEvaled = false;
      } else if (key === '⌫') {
        this.expr = this.expr.length <= 1 ? '0' : this.expr.slice(0, -1);
      } else if (key === '±') {
        this.expr = this.expr.startsWith('-')
          ? this.expr.slice(1)
          : this.expr !== '0'
            ? '-' + this.expr
            : this.expr;
      } else if (key === '%') {
        try {
          this.expr = String(this._eval(this.expr) / 100);
          this.justEvaled = true;
        } catch (_) {
          this.expr = 'Error';
        }
      } else if (key === '=') {
        try {
          const n = this._eval(this.expr);
          this.expr = String(Number.isFinite(n) ? +n.toPrecision(12) : 'Error');
          this.justEvaled = true;
        } catch (_) {
          this.expr = 'Error';
          this.justEvaled = true;
        }
      } else if (['+', '−', '×', '÷'].includes(key)) {
        this.justEvaled = false;
        const last = this.expr.slice(-1);
        if (['+', '−', '×', '÷'].includes(last)) this.expr = this.expr.slice(0, -1) + key;
        else this.expr += key;
      } else {
        if (this.justEvaled || this.expr === '0' || this.expr === 'Error') {
          this.expr = key === '.' ? '0.' : key;
          this.justEvaled = false;
        } else this.expr += key;
      }
      const el = document.getElementById('calc-display');
      if (el) el.textContent = this.expr;
    },
    _eval(raw) {
      const s = String(raw)
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-')
        .replace(/[^0-9+\-*/().\s]/g, '');
      if (!s || /[+\-*/.]$/.test(s.trim())) throw new Error('bad');
      const r = Function('"use strict"; return (' + s + ');')();
      if (typeof r !== 'number' || !Number.isFinite(r)) throw new Error('nan');
      return r;
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
              body: 'Your notes persist across sessions.\n\nClick + New note to create more.',
              modified: Date.now()
            }
          ];
      } catch (_) {
        this.notes = [{ id: 1, title: 'Welcome', body: 'Your notes live here.', modified: Date.now() }];
      }
    },
    async persist() {
      await Trosmos.storage?.put('appState', { id: 'notes', data: { notes: this.notes } });
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
        '<div class="p-3"><button type="button" id="notes-new-btn" class="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm">+ New note</button></div>' +
        '<div id="notes-list" class="flex-1 overflow-y-auto px-2 pb-2 space-y-1"></div></div>' +
        '<div class="flex-1 flex flex-col min-w-0">' +
        '<input id="notes-title" class="bg-transparent px-5 py-3 text-lg font-medium outline-none border-b border-white/10" placeholder="Title" />' +
        '<textarea id="notes-body" class="flex-1 bg-transparent p-5 text-sm outline-none resize-none leading-relaxed text-white/90" placeholder="Start writing…"></textarea>' +
        '</div></div>';
      document.body.appendChild(win);
      registerWin('notes-window', win);
      win.querySelector('#notes-new-btn')?.addEventListener('click', () => this.create());
      document.getElementById('notes-title').addEventListener('input', () => this.saveCurrent());
      document.getElementById('notes-body').addEventListener('input', () => this.saveCurrent());
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
        'window hidden absolute top-32 left-1/2 -translate-x-1/2 w-[380px] h-[340px] glass-strong rounded-premium overflow-hidden z-50 flex flex-col';
      win.innerHTML =
        '<div class="window-titlebar flex items-center justify-between px-4 py-2.5 border-b border-white/10 cursor-move select-none">' +
        '<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center"><i class="fa-solid fa-clock text-white text-xs"></i></div>' +
        '<div class="font-medium text-sm">Clock</div></div>' +
        '<div class="window-controls">' +
        '<button type="button" class="window-control minimize" onclick="Trosmos.windows.minimize(\'clock-window\')"><i class="fa-solid fa-minus"></i></button>' +
        '<button type="button" class="window-control close" onclick="Trosmos.windows.close(\'clock-window\')"><i class="fa-solid fa-xmark"></i></button>' +
        '</div></div>' +
        '<div class="flex-1 flex flex-col items-center justify-center gap-2">' +
        '<div id="clock-big" class="text-5xl font-display font-semibold tracking-tight">--:--:--</div>' +
        '<div id="clock-full" class="text-white/50 text-sm"></div>' +
        '<div class="mt-6 grid grid-cols-2 gap-3 w-full px-8">' +
        '<div class="glass rounded-2xl p-4 text-center"><div class="text-xs text-white/40 mb-1">Timezone</div><div id="clock-tz" class="text-sm font-medium">—</div></div>' +
        '<div class="glass rounded-2xl p-4 text-center"><div class="text-xs text-white/40 mb-1">UTC Offset</div><div id="clock-offset" class="text-sm font-medium">—</div></div>' +
        '</div></div>';
      document.body.appendChild(win);
      registerWin('clock-window', win);
    },
    tick() {
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
        '<div><h3 class="text-lg font-semibold text-white mb-1">Trosmos OS 2.7</h3>' +
        '<p class="text-white/50">Premium AI-native operating system.</p></div>' +
        '<div><h4 class="font-medium text-white mb-2">Keyboard shortcuts</h4><ul class="space-y-1 text-white/60">' +
        '<li><kbd class="px-1.5 py-0.5 rounded bg-white/10 text-xs">Ctrl+K</kbd> Command palette</li>' +
        '<li><kbd class="px-1.5 py-0.5 rounded bg-white/10 text-xs">Ctrl+T</kbd> Terminal</li>' +
        '<li><kbd class="px-1.5 py-0.5 rounded bg-white/10 text-xs">Ctrl+L</kbd> Lock screen</li>' +
        '<li><kbd class="px-1.5 py-0.5 rounded bg-white/10 text-xs">Esc</kbd> Close overlays</li></ul></div>' +
        '<div><h4 class="font-medium text-white mb-2">Built-in apps</h4>' +
        '<p>AI, Files, Browser, Terminal, Calculator, Notes, Clock, Clipboard, Settings, App Store, Task Manager.</p></div>' +
        '<div class="text-white/40 text-xs pt-2 border-t border-white/10">Files persist via IndexedDB. AI requires Netlify + GEMINI_API_KEY.</div></div>';
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

    console.log('%c[Trosmos] Apps extension v2.7 loaded', 'color:#10B981');
  }

  if (document.readyState === 'complete') {
    setTimeout(bootApps, 200);
  } else {
    window.addEventListener('load', () => setTimeout(bootApps, 200));
  }
})();
