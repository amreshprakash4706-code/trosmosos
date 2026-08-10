/**
 * Trosmos OS — Backend API client & session bridge
 * Provides real multi-user auth, server VFS, settings sync, AI, WebSocket.
 * Falls back gracefully when the backend is unavailable (local IndexedDB mode).
 */
(function () {
  'use strict';

  const API_BASE = '/api/v1';
  const TOKEN_KEY = 'trosmos_token';
  const USER_KEY = 'trosmos_user';

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  }

  function setSession(token, user) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch (_) {}
  }

  function getStoredUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function request(method, path, body, opts = {}) {
    const headers = {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    });

    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || 'Request failed');
      err.status = res.status;
      err.code = data?.code;
      err.data = data;
      throw err;
    }
    return data;
  }

  const api = {
    getToken,
    getStoredUser,
    isAuthenticated() {
      return Boolean(getToken());
    },

    async health() {
      return request('GET', '/system/health');
    },

    async systemInfo() {
      return request('GET', '/system/info');
    },

    async register({ username, password, email, displayName }) {
      const data = await request('POST', '/auth/register', {
        username,
        password,
        email,
        displayName,
      });
      return data;
    },

    async login({ username, password }) {
      const data = await request('POST', '/auth/login', { username, password });
      if (data.token) setSession(data.token, data.user);
      return data;
    },

    async logout() {
      try {
        await request('POST', '/auth/logout');
      } catch (_) {}
      setSession(null, null);
      if (window.TrosmosAPI?._ws) {
        try {
          window.TrosmosAPI._ws.close();
        } catch (_) {}
      }
    },

    async me() {
      const data = await request('GET', '/auth/me');
      if (data.user) setSession(getToken(), data.user);
      return data.user;
    },

    // Files
    async listDir(path = '/Home') {
      return request('GET', `/files?path=${encodeURIComponent(path)}`);
    },
    async readFile(path) {
      return request('GET', `/files/read?path=${encodeURIComponent(path)}`);
    },
    async createFolder(parent, name) {
      return request('POST', '/files/folder', { parent, name });
    },
    async createFile(parent, name, content = '') {
      return request('POST', '/files/file', { parent, name, content });
    },
    async writeFile(path, content) {
      return request('PUT', '/files/write', { path, content });
    },
    async rename(path, name) {
      return request('POST', '/files/rename', { path, name });
    },
    async move(path, destination) {
      return request('POST', '/files/move', { path, destination });
    },

    async copy(path, destination, name) {
      return request('POST', '/files/copy', { path, destination, name });
    },
    async trash(path) {
      return request('POST', '/files/trash', { path });
    },
    async restore(path) {
      return request('POST', '/files/restore', { path });
    },
    async remove(path) {
      return request('DELETE', `/files?path=${encodeURIComponent(path)}`);
    },
    async searchFiles(q) {
      return request('GET', `/files/search?q=${encodeURIComponent(q)}`);
    },
    async storageStats() {
      return request('GET', '/files/stats');
    },
    async fileTree(root = '/Home') {
      return request('GET', `/files/tree?root=${encodeURIComponent(root)}`);
    },

    // Settings
    async getSettings() {
      return request('GET', '/settings');
    },
    async setSetting(key, value) {
      return request('PUT', `/settings/${encodeURIComponent(key)}`, { value });
    },
    async setSettings(settings) {
      return request('PUT', '/settings', { settings });
    },

    // Notifications
    async getNotifications(unreadOnly = false) {
      return request('GET', `/notifications${unreadOnly ? '?unread=1' : ''}`);
    },
    async createNotification(payload) {
      return request('POST', '/notifications', payload);
    },
    async markNotificationRead(id) {
      return request('POST', `/notifications/${id}/read`);
    },
    async markAllNotificationsRead() {
      return request('POST', '/notifications/read-all');
    },

    // Search
    async search(q) {
      return request('GET', `/search?q=${encodeURIComponent(q)}`);
    },

    // Apps
    async appCatalog() {
      return request('GET', '/apps/catalog');
    },
    async installedApps() {
      return request('GET', '/apps/installed');
    },

    // AI
    async aiChat({ message, history = [], toolResults = [] }) {
      return request('POST', '/ai/chat', { message, history, toolResults });
    },
    async aiStatus() {
      return request('GET', '/ai/status');
    },

    // Tasks
    async listTasks(status) {
      return request('GET', `/tasks${status ? '?status=' + encodeURIComponent(status) : ''}`);
    },

    // Users
    async updateProfile(data) {
      return request('PATCH', '/users/profile', data);
    },
    async changePassword(currentPassword, newPassword) {
      return request('POST', '/users/password', { currentPassword, newPassword });
    },
    async listSessions() {
      return request('GET', '/auth/sessions');
    },
    async revokeSession(id) {
      return request('DELETE', `/auth/sessions/${encodeURIComponent(id)}`);
    },

    // WebSocket
    connectWebSocket(onMessage) {
      const token = getToken();
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const qs = token ? `?token=${encodeURIComponent(token)}` : '';
      const ws = new WebSocket(`${proto}://${location.host}/ws${qs}`);
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (typeof onMessage === 'function') onMessage(msg);
          window.dispatchEvent(new CustomEvent('trosmos:ws', { detail: msg }));
        } catch (_) {}
      });
      ws.addEventListener('close', () => {
        // Auto-reconnect after delay if still authenticated
        setTimeout(() => {
          if (getToken()) api.connectWebSocket(onMessage);
        }, 4000);
      });
      api._ws = ws;
      return ws;
    },

    /** Probe whether backend is reachable */
    async probe() {
      try {
        const h = await api.health();
        return { ok: true, ...h };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
  };

  window.TrosmosAPI = api;

  // Expose for existing code
  window.TrosmosBackend = {
    available: false,
    user: null,
    async init() {
      const probe = await api.probe();
      this.available = probe.ok;
      if (!probe.ok) return { mode: 'local', backend: false };

      if (api.isAuthenticated()) {
        try {
          this.user = await api.me();
          api.connectWebSocket((msg) => {
            if (msg.type === 'notification' && window.Trosmos?.notify) {
              const n = msg.payload;
              Trosmos.notify(n.title + (n.body ? ': ' + n.body : ''), n.type || 'info');
            }
          });
          return { mode: 'cloud', backend: true, user: this.user };
        } catch {
          setSession(null, null);
          this.user = null;
        }
      }
      return { mode: 'local', backend: true };
    },
  };
})();
