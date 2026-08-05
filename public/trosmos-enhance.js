/**
 * Trosmos OS 2.9 — Device-aware shell enhancement
 * Mobile home, status bar, dock, app switcher, power menu, workspaces,
 * quick settings, battery/network sensors, idle lock.
 * Loads after core OS + trosmos-apps.js. Non-destructive.
 */
(function () {
  'use strict';

  const VERSION = '2.9.0';

  /* ---------- Device detection ---------- */
  const Device = {
    mode: 'desktop', // desktop | tablet | mobile
    coarse: false,
    hover: true,
    mqMobile: null,
    mqTablet: null,

    init() {
      this.mqMobile = window.matchMedia('(max-width: 768px), ((max-width: 900px) and (pointer: coarse))');
      this.mqTablet = window.matchMedia('(min-width: 769px) and (max-width: 1024px)');
      this.coarse = window.matchMedia('(pointer: coarse)').matches;
      this.hover = window.matchMedia('(hover: hover)').matches;
      this.update();
      const onChange = () => this.update();
      this.mqMobile.addEventListener?.('change', onChange);
      this.mqTablet.addEventListener?.('change', onChange);
      window.addEventListener('orientationchange', () => setTimeout(() => this.update(), 120));
      window.addEventListener('resize', debounce(() => this.update(), 150));
    },

    update() {
      const w = window.innerWidth;
      let next = 'desktop';
      if (this.mqMobile.matches || w <= 768) next = 'mobile';
      else if (this.mqTablet.matches || (w <= 1024 && this.coarse)) next = 'tablet';
      if (next === this.mode && document.body.classList.contains('trosmos-' + next)) return;
      this.mode = next;
      document.body.classList.remove('trosmos-desktop', 'trosmos-tablet', 'trosmos-mobile');
      document.body.classList.add('trosmos-' + next);
      document.documentElement.dataset.device = next;
      window.dispatchEvent(new CustomEvent('trosmos:device', { detail: { mode: next } }));
    },

    isMobile() {
      return this.mode === 'mobile';
    }
  };

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  function esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- Sensors (battery / network) ---------- */
  const Sensors = {
    battery: null,
    online: navigator.onLine,
    async init() {
      window.addEventListener('online', () => {
        this.online = true;
        MobileStatus.render();
      });
      window.addEventListener('offline', () => {
        this.online = false;
        MobileStatus.render();
        if (window.Trosmos?.notifications) {
          Trosmos.notifications.show('You are offline — local apps still work', 'warning');
        }
      });
      try {
        if (navigator.getBattery) {
          this.battery = await navigator.getBattery();
          const tick = () => MobileStatus.render();
          this.battery.addEventListener('levelchange', tick);
          this.battery.addEventListener('chargingchange', tick);
        }
      } catch (_) {}
      MobileStatus.render();
      setInterval(() => MobileStatus.render(), 30000);
    },
    batteryPct() {
      if (!this.battery) return null;
      return Math.round(this.battery.level * 100);
    },
    batteryIcon() {
      const pct = this.batteryPct();
      if (pct == null) return 'fa-battery-three-quarters';
      if (this.battery?.charging) return 'fa-battery-full';
      if (pct > 80) return 'fa-battery-full';
      if (pct > 50) return 'fa-battery-three-quarters';
      if (pct > 20) return 'fa-battery-half';
      if (pct > 10) return 'fa-battery-quarter';
      return 'fa-battery-empty';
    }
  };

  /* ---------- Mobile status bar ---------- */
  const MobileStatus = {
    ensure() {
      if (document.getElementById('mobile-status-bar')) return;
      const el = document.createElement('div');
      el.id = 'mobile-status-bar';
      el.setAttribute('role', 'status');
      el.innerHTML =
        '<div class="msb-left"><span id="msb-net"><i class="fa-solid fa-wifi"></i></span></div>' +
        '<div class="msb-center" id="msb-time">--:--</div>' +
        '<div class="msb-right"><span id="msb-batt"><i class="fa-solid fa-battery-three-quarters"></i> <span id="msb-batt-pct"></span></span></div>';
      document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        if (e.target.closest('.msb-center') || e.target === el) QuickSettings.toggle();
      });
    },
    render() {
      this.ensure();
      const now = new Date();
      const t = document.getElementById('msb-time');
      if (t) t.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const net = document.getElementById('msb-net');
      if (net) {
        net.innerHTML = Sensors.online
          ? '<i class="fa-solid fa-wifi" aria-label="Online"></i>'
          : '<i class="fa-solid fa-plane" aria-label="Offline"></i>';
      }
      const pct = Sensors.batteryPct();
      const bi = document.getElementById('msb-batt');
      const bp = document.getElementById('msb-batt-pct');
      if (bi) bi.querySelector('i')?.setAttribute('class', 'fa-solid ' + Sensors.batteryIcon());
      if (bp) bp.textContent = pct != null ? pct + '%' : '';
    }
  };

  /* ---------- Mobile home + dock ---------- */
  const MOBILE_APPS = [
    { id: 'ai', name: 'AI', icon: 'fa-robot', grad: 'from-[#3B82F6] to-[#7C3AED]', launch: () => window.openAIAssistant?.() },
    { id: 'files', name: 'Files', icon: 'fa-folder', grad: 'from-[#3B82F6] to-[#06B6D4]', launch: () => window.openFileManager?.() },
    { id: 'browser', name: 'Browser', icon: 'fa-globe', grad: 'from-emerald-400 to-[#06B6D4]', launch: () => window.openBrowser?.() },
    { id: 'notes', name: 'Notes', icon: 'fa-note-sticky', grad: 'from-yellow-400 to-amber-500', launch: () => window.openNotes?.() },
    { id: 'terminal', name: 'Terminal', icon: 'fa-terminal', grad: 'from-emerald-400 to-cyan-500', launch: () => window.openTerminal?.() },
    { id: 'calculator', name: 'Calculator', icon: 'fa-calculator', grad: 'from-amber-400 to-orange-500', launch: () => window.openCalculator?.() },
    { id: 'clock', name: 'Clock', icon: 'fa-clock', grad: 'from-sky-400 to-blue-600', launch: () => window.openClock?.() },
    { id: 'clipboard', name: 'Clipboard', icon: 'fa-clipboard', grad: 'from-violet-400 to-purple-600', launch: () => window.openClipboard?.() },
    { id: 'settings', name: 'Settings', icon: 'fa-gear', grad: 'from-slate-400 to-white/70', launch: () => window.openSettings?.() },
    { id: 'store', name: 'App Store', icon: 'fa-store', grad: 'from-orange-400 to-red-500', launch: () => window.openAppStore?.() },
    { id: 'tasks', name: 'Tasks', icon: 'fa-microchip', grad: 'from-cyan-400 to-blue-500', launch: () => window.openTaskManager?.() },
    { id: 'help', name: 'Help', icon: 'fa-circle-question', grad: 'from-slate-400 to-slate-600', launch: () => window.openHelp?.() }
  ];

  const MobileShell = {
    ensure() {
      if (!document.getElementById('mobile-home')) {
        const home = document.createElement('div');
        home.id = 'mobile-home';
        home.setAttribute('aria-label', 'Home screen');
        home.innerHTML =
          '<div class="mh-greeting"><h2 id="mh-hello">Good day</h2><p>Your Trosmos workspace</p></div>' +
          '<div class="mh-widget-row">' +
          '<div class="mh-widget"><div class="text-xs text-white/50">Time</div><div id="mh-clock" class="text-2xl font-semibold mt-1 tabular-nums">--:--</div><div id="mh-date" class="text-xs text-white/40 mt-1"></div></div>' +
          '<div class="mh-widget"><div class="text-xs text-white/50">Status</div><div id="mh-status" class="text-sm mt-2 text-white/80">All systems ready</div></div>' +
          '</div>' +
          '<div class="mh-app-grid" id="mh-grid" role="list"></div>';
        const area = document.getElementById('desktop-area') || document.getElementById('desktop');
        if (area) area.appendChild(home);
        else document.body.appendChild(home);
        this.renderGrid();
      }
      if (!document.getElementById('mobile-dock')) {
        const dock = document.createElement('div');
        dock.id = 'mobile-dock';
        dock.setAttribute('role', 'toolbar');
        dock.setAttribute('aria-label', 'Mobile navigation');
        dock.innerHTML =
          '<div class="md-inner">' +
          '<button type="button" class="md-btn" data-act="home" aria-label="Home"><i class="fa-solid fa-house"></i></button>' +
          '<button type="button" class="md-btn" data-act="search" aria-label="Search"><i class="fa-solid fa-magnifying-glass"></i></button>' +
          '<button type="button" class="md-btn" data-act="ai" aria-label="AI"><i class="fa-solid fa-robot"></i></button>' +
          '<button type="button" class="md-btn" data-act="recents" aria-label="Recent apps"><i class="fa-solid fa-clone"></i></button>' +
          '<button type="button" class="md-btn" data-act="power" aria-label="Power"><i class="fa-solid fa-power-off"></i></button>' +
          '</div>';
        document.body.appendChild(dock);
        dock.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-act]');
          if (!btn) return;
          const act = btn.dataset.act;
          if (act === 'home') this.goHome();
          else if (act === 'search') window.openCommandPalette?.() || document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
          else if (act === 'ai') window.openAIAssistant?.();
          else if (act === 'recents') AppSwitcher.open();
          else if (act === 'power') PowerMenu.open();
        });
      }
      this.tick();
      if (!this._timer) this._timer = setInterval(() => this.tick(), 15000);
    },

    renderGrid() {
      const grid = document.getElementById('mh-grid');
      if (!grid) return;
      grid.innerHTML = MOBILE_APPS.map(
        (a) =>
          '<button type="button" class="mh-app" role="listitem" data-app="' +
          esc(a.id) +
          '" aria-label="' +
          esc(a.name) +
          '">' +
          '<div class="mh-app-icon bg-gradient-to-br ' +
          a.grad +
          '"><i class="fa-solid ' +
          a.icon +
          '" aria-hidden="true"></i></div>' +
          '<span class="mh-app-label">' +
          esc(a.name) +
          '</span></button>'
      ).join('');
      grid.querySelectorAll('.mh-app').forEach((btn) => {
        btn.addEventListener('click', () => {
          const app = MOBILE_APPS.find((x) => x.id === btn.dataset.app);
          if (app?.launch) {
            try {
              app.launch();
              document.body.classList.add('trosmos-app-open');
            } catch (err) {
              console.error('[MobileShell] launch', err);
            }
          }
        });
      });
    },

    tick() {
      const now = new Date();
      const h = now.getHours();
      const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
      const hello = document.getElementById('mh-hello');
      if (hello) hello.textContent = greet;
      const clk = document.getElementById('mh-clock');
      if (clk) clk.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dt = document.getElementById('mh-date');
      if (dt) dt.textContent = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      const st = document.getElementById('mh-status');
      if (st) st.textContent = Sensors.online ? 'Online • Ready' : 'Offline • Local mode';
    },

    goHome() {
      // Close all visible windows on mobile
      document.querySelectorAll('.window:not(.hidden)').forEach((w) => {
        if (window.Trosmos?.windows?.close) Trosmos.windows.close(w.id);
        else w.classList.add('hidden');
      });
      document.body.classList.remove('trosmos-app-open');
      AppSwitcher.close();
      QuickSettings.close();
      PowerMenu.close();
      const palette = document.getElementById('command-palette');
      if (palette) palette.classList.add('hidden');
    },

    observeWindows() {
      const observer = new MutationObserver(() => {
        const anyOpen = !!document.querySelector('.window:not(.hidden)');
        document.body.classList.toggle('trosmos-app-open', anyOpen && Device.isMobile());
      });
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
  };

  /* ---------- App switcher ---------- */
  const AppSwitcher = {
    index: 0,
    ensure() {
      if (document.getElementById('app-switcher')) return;
      const el = document.createElement('div');
      el.id = 'app-switcher';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Running applications');
      el.innerHTML = '<div class="as-track" id="as-track"></div>';
      document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        if (e.target === el) this.close();
      });
    },
    apps() {
      const list = [];
      document.querySelectorAll('.window').forEach((w) => {
        if (w.classList.contains('hidden')) return;
        const title =
          w.getAttribute('aria-label') ||
          w.querySelector('.font-medium, .window-titlebar')?.textContent?.trim() ||
          w.id;
        const icon = w.querySelector('.fa-solid, .fa-regular')?.className || 'fa-solid fa-window-maximize';
        list.push({ id: w.id, title: title.slice(0, 40), icon });
      });
      return list;
    },
    open() {
      this.ensure();
      const apps = this.apps();
      const track = document.getElementById('as-track');
      if (!apps.length) {
        if (window.Trosmos?.notifications) Trosmos.notifications.show('No open applications', 'info');
        return;
      }
      track.innerHTML = apps
        .map(
          (a, i) =>
            '<button type="button" class="as-card' +
            (i === 0 ? ' active' : '') +
            '" data-id="' +
            esc(a.id) +
            '" data-idx="' +
            i +
            '"><div class="as-card-body"><i class="' +
            esc(a.icon) +
            '"></i></div><div class="as-card-label">' +
            esc(a.title) +
            '</div></button>'
        )
        .join('');
      track.querySelectorAll('.as-card').forEach((card) => {
        card.addEventListener('click', () => this.activate(card.dataset.id));
      });
      this.index = 0;
      document.getElementById('app-switcher').classList.add('open');
    },
    cycle(dir) {
      const cards = [...document.querySelectorAll('#as-track .as-card')];
      if (!cards.length) return;
      this.index = (this.index + dir + cards.length) % cards.length;
      cards.forEach((c, i) => c.classList.toggle('active', i === this.index));
      cards[this.index]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    },
    activate(id) {
      const wid = id || document.querySelector('#as-track .as-card.active')?.dataset.id;
      this.close();
      if (wid && window.Trosmos?.windows?.focusOrOpen) Trosmos.windows.focusOrOpen(wid);
      else if (wid) {
        const w = document.getElementById(wid);
        if (w) {
          w.classList.remove('hidden');
          document.body.classList.add('trosmos-app-open');
        }
      }
    },
    close() {
      document.getElementById('app-switcher')?.classList.remove('open');
    },
    isOpen() {
      return document.getElementById('app-switcher')?.classList.contains('open');
    }
  };

  /* ---------- Power menu ---------- */
  const PowerMenu = {
    ensure() {
      if (document.getElementById('power-menu')) return;
      const el = document.createElement('div');
      el.id = 'power-menu';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Power options');
      el.innerHTML =
        '<div class="pm-card">' +
        '<div class="pm-title">Power</div>' +
        '<div class="pm-actions">' +
        '<button type="button" class="pm-btn" data-power="lock"><i class="fa-solid fa-lock"></i>Lock</button>' +
        '<button type="button" class="pm-btn" data-power="sleep"><i class="fa-solid fa-moon"></i>Sleep</button>' +
        '<button type="button" class="pm-btn" data-power="restart"><i class="fa-solid fa-rotate"></i>Restart</button>' +
        '<button type="button" class="pm-btn danger" data-power="shutdown"><i class="fa-solid fa-power-off"></i>Shut down</button>' +
        '</div>' +
        '<button type="button" class="pm-cancel" data-power="cancel">Cancel</button></div>';
      document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-power]');
        if (!btn) {
          if (e.target === el) this.close();
          return;
        }
        this.action(btn.dataset.power);
      });
    },
    open() {
      this.ensure();
      document.getElementById('power-menu').classList.add('open');
    },
    close() {
      document.getElementById('power-menu')?.classList.remove('open');
    },
    action(kind) {
      this.close();
      if (kind === 'cancel') return;
      if (kind === 'lock') {
        if (typeof window.lockSystem === 'function') window.lockSystem();
        else IdleLock.lock();
        return;
      }
      if (kind === 'sleep') {
        SleepOverlay.show();
        return;
      }
      if (kind === 'restart') {
        if (window.Trosmos?.notifications) Trosmos.notifications.show('Restarting Trosmos…', 'info');
        setTimeout(() => location.reload(), 600);
        return;
      }
      if (kind === 'shutdown') {
        // Simulated OS shutdown — return to landing
        document.querySelectorAll('.window:not(.hidden)').forEach((w) => w.classList.add('hidden'));
        const desk = document.getElementById('desktop');
        if (desk) {
          desk.classList.add('hidden');
          desk.classList.remove('flex', 'flex-col');
        }
        const landing = document.getElementById('landing-page');
        if (landing) landing.classList.remove('hidden');
        document.body.classList.remove('trosmos-app-open');
        if (window.Trosmos?.notifications) Trosmos.notifications.show('Trosmos shut down. Refresh to boot.', 'info');
      }
    }
  };

  const SleepOverlay = {
    ensure() {
      if (document.getElementById('sleep-overlay')) return;
      const el = document.createElement('div');
      el.id = 'sleep-overlay';
      el.innerHTML = '<div>Tap or press any key to wake</div>';
      el.addEventListener('click', () => this.hide());
      document.body.appendChild(el);
    },
    show() {
      this.ensure();
      document.getElementById('sleep-overlay').classList.add('open');
      this._onKey = () => this.hide();
      document.addEventListener('keydown', this._onKey, { once: true });
    },
    hide() {
      document.getElementById('sleep-overlay')?.classList.remove('open');
      if (window.Trosmos?.notifications) Trosmos.notifications.show('Welcome back', 'success');
    }
  };

  /* ---------- Quick settings (mobile) ---------- */
  const QuickSettings = {
    wifi: true,
    ensure() {
      if (document.getElementById('quick-settings')) return;
      const el = document.createElement('div');
      el.id = 'quick-settings';
      el.innerHTML =
        '<div class="flex items-center justify-between"><div class="text-sm font-medium">Quick Settings</div>' +
        '<button type="button" id="qs-close" class="window-control" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>' +
        '<div class="qs-grid">' +
        '<button type="button" class="qs-tile on" data-qs="wifi"><i class="fa-solid fa-wifi"></i>Wi‑Fi</button>' +
        '<button type="button" class="qs-tile" data-qs="bt"><i class="fa-brands fa-bluetooth-b"></i>Bluetooth</button>' +
        '<button type="button" class="qs-tile" data-qs="motion"><i class="fa-solid fa-person-walking"></i>Motion</button>' +
        '<button type="button" class="qs-tile" data-qs="lock"><i class="fa-solid fa-lock"></i>Lock</button>' +
        '<button type="button" class="qs-tile" data-qs="settings"><i class="fa-solid fa-gear"></i>Settings</button>' +
        '<button type="button" class="qs-tile" data-qs="notify"><i class="fa-solid fa-bell"></i>Alerts</button>' +
        '<button type="button" class="qs-tile" data-qs="palette"><i class="fa-solid fa-magnifying-glass"></i>Search</button>' +
        '<button type="button" class="qs-tile" data-qs="power"><i class="fa-solid fa-power-off"></i>Power</button>' +
        '</div>';
      document.body.appendChild(el);
      el.querySelector('#qs-close')?.addEventListener('click', () => this.close());
      el.querySelectorAll('[data-qs]').forEach((btn) => {
        btn.addEventListener('click', () => this.tap(btn.dataset.qs, btn));
      });
    },
    toggle() {
      if (document.getElementById('quick-settings')?.classList.contains('open')) this.close();
      else this.open();
    },
    open() {
      this.ensure();
      document.getElementById('quick-settings').classList.add('open');
    },
    close() {
      document.getElementById('quick-settings')?.classList.remove('open');
    },
    tap(id, btn) {
      if (id === 'wifi') {
        this.wifi = !this.wifi;
        btn.classList.toggle('on', this.wifi);
        if (window.Trosmos?.notifications)
          Trosmos.notifications.show(this.wifi ? 'Wi‑Fi simulation on' : 'Wi‑Fi simulation off', 'info');
      } else if (id === 'bt') {
        btn.classList.toggle('on');
      } else if (id === 'motion') {
        document.documentElement.classList.toggle('reduce-motion');
        document.body.classList.toggle('reduce-motion');
        btn.classList.toggle('on');
      } else if (id === 'lock') {
        this.close();
        PowerMenu.action('lock');
      } else if (id === 'settings') {
        this.close();
        window.openSettings?.();
      } else if (id === 'notify') {
        this.close();
        window.showNotifications?.();
      } else if (id === 'palette') {
        this.close();
        window.openCommandPalette?.();
      } else if (id === 'power') {
        this.close();
        PowerMenu.open();
      }
    }
  };

  /* ---------- Workspaces (desktop) ---------- */
  const Workspaces = {
    current: 0,
    count: 3,
    // windowId -> workspace index
    map: {},
    ensure() {
      if (document.getElementById('workspace-bar')) return;
      const bar = document.createElement('div');
      bar.id = 'workspace-bar';
      bar.setAttribute('role', 'tablist');
      bar.setAttribute('aria-label', 'Workspaces');
      for (let i = 0; i < this.count; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ws-dot' + (i === 0 ? ' active' : '');
        b.dataset.ws = String(i);
        b.setAttribute('aria-label', 'Workspace ' + (i + 1));
        b.setAttribute('role', 'tab');
        bar.appendChild(b);
      }
      document.body.appendChild(bar);
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ws]');
        if (btn) this.switchTo(Number(btn.dataset.ws));
      });
      try {
        const raw = localStorage.getItem('trosmos-workspaces');
        if (raw) {
          const data = JSON.parse(raw);
          if (typeof data.current === 'number') this.current = data.current;
          if (data.map) this.map = data.map;
        }
      } catch (_) {}
    },
    persist() {
      try {
        localStorage.setItem('trosmos-workspaces', JSON.stringify({ current: this.current, map: this.map }));
      } catch (_) {}
    },
    assignOpenWindows() {
      document.querySelectorAll('.window:not(.hidden)').forEach((w) => {
        if (this.map[w.id] == null) this.map[w.id] = this.current;
      });
    },
    switchTo(idx) {
      if (idx < 0 || idx >= this.count) return;
      this.assignOpenWindows();
      this.current = idx;
      document.querySelectorAll('#workspace-bar .ws-dot').forEach((d) => {
        d.classList.toggle('active', Number(d.dataset.ws) === idx);
      });
      document.querySelectorAll('.window').forEach((w) => {
        const ws = this.map[w.id];
        if (ws == null) return;
        if (ws === idx) {
          // don't force-show minimized conceptually; only unhide if it was on this space
          if (w.dataset.wsHidden === '1') {
            w.classList.remove('hidden');
            delete w.dataset.wsHidden;
          }
        } else if (!w.classList.contains('hidden')) {
          w.dataset.wsHidden = '1';
          w.classList.add('hidden');
        }
      });
      this.persist();
      if (window.Trosmos?.notifications) {
        Trosmos.notifications.show('Workspace ' + (idx + 1), 'info');
      }
    },
    onWindowOpen(id) {
      this.map[id] = this.current;
      this.persist();
    }
  };

  /* ---------- Idle lock ---------- */
  const IdleLock = {
    timeoutMs: 15 * 60 * 1000,
    timer: null,
    init() {
      const reset = () => this.bump();
      ['pointerdown', 'keydown', 'touchstart', 'mousemove'].forEach((ev) => {
        document.addEventListener(ev, reset, { passive: true });
      });
      this.bump();
    },
    bump() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.lock(), this.timeoutMs);
    },
    lock() {
      const desk = document.getElementById('desktop');
      if (!desk || desk.classList.contains('hidden')) return;
      if (typeof window.lockSystem === 'function') window.lockSystem();
    }
  };

  /* ---------- Keyboard: Alt+Tab, Ctrl+W, power ---------- */
  function setupShortcuts() {
    let altHeld = false;
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

      // Alt+Tab app switcher
      if (e.key === 'Tab' && e.altKey) {
        e.preventDefault();
        if (!AppSwitcher.isOpen()) AppSwitcher.open();
        else AppSwitcher.cycle(e.shiftKey ? -1 : 1);
        altHeld = true;
        return;
      }

      if (AppSwitcher.isOpen() && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        AppSwitcher.activate();
        return;
      }

      if (e.key === 'Escape') {
        if (AppSwitcher.isOpen()) {
          AppSwitcher.close();
          return;
        }
        if (document.getElementById('power-menu')?.classList.contains('open')) {
          PowerMenu.close();
          return;
        }
        if (document.getElementById('quick-settings')?.classList.contains('open')) {
          QuickSettings.close();
          return;
        }
      }

      if (typing) return;

      // Ctrl/Cmd+W close focused window
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const focused = document.querySelector('.window.is-focused:not(.hidden), .window:not(.hidden)');
        if (focused?.id && window.Trosmos?.windows?.close) Trosmos.windows.close(focused.id);
        else if (focused) focused.classList.add('hidden');
        if (Device.isMobile()) document.body.classList.remove('trosmos-app-open');
        return;
      }

      // Ctrl/Cmd+Shift+P or Ctrl+Space → palette (palette already on Ctrl+K)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.openCommandPalette?.();
        return;
      }

      // Workspace switching Ctrl+1/2/3
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        Workspaces.switchTo(Number(e.key) - 1);
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Alt' && altHeld && AppSwitcher.isOpen()) {
        altHeld = false;
        AppSwitcher.activate();
      }
    });
  }

  /* ---------- Hook window open for workspace assignment ---------- */
  function patchWindowManager() {
    const WM = window.Trosmos?.windows;
    if (!WM || WM._enhanced) return;
    WM._enhanced = true;
    const origFocus = WM.focusOrOpen?.bind(WM);
    if (origFocus) {
      WM.focusOrOpen = function (id) {
        Workspaces.onWindowOpen(id);
        return origFocus(id);
      };
    }
    const origClose = WM.close?.bind(WM);
    if (origClose) {
      WM.close = function (id) {
        const r = origClose(id);
        if (Device.isMobile()) {
          const any = document.querySelector('.window:not(.hidden)');
          if (!any) document.body.classList.remove('trosmos-app-open');
        }
        return r;
      };
    }
  }

  /* ---------- Expand command palette with system actions ---------- */
  function enrichPalette() {
    if (!window.COMMAND_PALETTE_CMDS && !window.Trosmos) return;
    const extra = [
      { id: 'power-menu', label: 'Power Menu', keywords: 'power lock sleep shutdown restart', action: () => PowerMenu.open() },
      { id: 'app-switcher', label: 'Switch App', keywords: 'alt tab switch recent apps', action: () => AppSwitcher.open() },
      { id: 'ws-1', label: 'Workspace 1', keywords: 'workspace desktop virtual', action: () => Workspaces.switchTo(0) },
      { id: 'ws-2', label: 'Workspace 2', keywords: 'workspace desktop virtual', action: () => Workspaces.switchTo(1) },
      { id: 'ws-3', label: 'Workspace 3', keywords: 'workspace desktop virtual', action: () => Workspaces.switchTo(2) },
      { id: 'mobile-home', label: 'Go Home', keywords: 'home mobile', action: () => MobileShell.goHome() },
      { id: 'sleep', label: 'Sleep', keywords: 'sleep suspend', action: () => SleepOverlay.show() }
    ];
    if (Array.isArray(window.COMMAND_PALETTE_CMDS)) {
      extra.forEach((c) => {
        if (!window.COMMAND_PALETTE_CMDS.find((x) => x.id === c.id)) window.COMMAND_PALETTE_CMDS.push(c);
      });
    }
  }

  /* ---------- Boot ---------- */
  function boot() {
    Device.init();
    MobileStatus.ensure();
    MobileShell.ensure();
    MobileShell.observeWindows();
    Workspaces.ensure();
    Sensors.init();
    IdleLock.init();
    setupShortcuts();
    patchWindowManager();
    enrichPalette();

    // Re-patch when Trosmos finishes late init
    const tryPatch = () => {
      if (window.Trosmos?.windows) patchWindowManager();
    };
    setTimeout(tryPatch, 500);
    setTimeout(tryPatch, 1500);
    setTimeout(enrichPalette, 800);

    console.log('%c[Trosmos] Shell enhancement v' + VERSION + ' • mode=' + Device.mode, 'color:#06B6D4');
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 300);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300));
  }

  window.TrosmosEnhance = {
    version: VERSION,
    Device,
    MobileShell,
    AppSwitcher,
    PowerMenu,
    Workspaces,
    QuickSettings,
    Sensors
  };
})();
