/**
 * Trosmos OS — StorageManager (IndexedDB)
 * Non-destructive schema migrations. Never deletes user data on upgrade.
 * Graceful degradation to in-memory when IndexedDB is unavailable.
 */

const DB_NAME = 'TrosmosOS';
const DB_VERSION = 5;

const STORE_DEFS = {
  filesystem: { keyPath: 'id' },
  settings: { keyPath: 'id' },
  windowStates: { keyPath: 'id' },
  browserHistory: { keyPath: 'id' },
  notifications: { keyPath: 'id' },
  desktopIcons: { keyPath: 'id' },
  permissions: { keyPath: 'id' },
  processes: { keyPath: 'id' },
  appState: { keyPath: 'id' }
};

export class StorageManager {
  constructor() {
    this.db = null;
    this.ready = false;
    this._memory = new Map();
    this._quotaWarned = false;
  }

  async init() {
    if (typeof indexedDB === 'undefined') {
      console.warn('[Trosmos Storage] IndexedDB unavailable — using in-memory mode');
      this.ready = false;
      return;
    }

    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const timeout = setTimeout(() => {
        console.warn('[Trosmos Storage] IndexedDB open timed out — in-memory mode');
        this.ready = false;
        done();
      }, 4000);

      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          const oldVersion = event.oldVersion;

          Object.entries(STORE_DEFS).forEach(([name, opts]) => {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, opts);
              console.info(`[Trosmos Storage] Created store: ${name}`);
            }
          });

          if (oldVersion > 0 && oldVersion < DB_VERSION) {
            console.info(`[Trosmos Storage] Migrated v${oldVersion} → v${DB_VERSION} (non-destructive)`);
          }
        };

        request.onsuccess = (event) => {
          clearTimeout(timeout);
          this.db = event.target.result;
          this.ready = true;

          this.db.onversionchange = () => {
            this.db.close();
            this.db = null;
            this.ready = false;
            console.warn('[Trosmos Storage] Database version changed elsewhere — closed connection');
          };

          done();
        };

        request.onerror = () => {
          clearTimeout(timeout);
          console.error('[Trosmos Storage] IndexedDB open failed', request.error);
          this.ready = false;
          done();
        };

        request.onblocked = () => {
          console.warn('[Trosmos Storage] IndexedDB open blocked — close other tabs');
        };
      } catch (err) {
        clearTimeout(timeout);
        console.error('[Trosmos Storage] IndexedDB exception', err);
        this.ready = false;
        done();
      }
    });
  }

  _memKey(storeName, id) {
    return `${storeName}::${id}`;
  }

  async put(storeName, data) {
    if (!data || data.id == null) {
      console.warn(`StorageManager.put: missing id for store "${storeName}"`);
      return false;
    }

    this._memory.set(this._memKey(storeName, data.id), structuredClone(data));

    if (!this.db) return true;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(data);
        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          this._handleQuota(req.error);
          resolve(false);
        };
        tx.onerror = () => resolve(false);
      } catch (e) {
        this._handleQuota(e);
        resolve(false);
      }
    });
  }

  async get(storeName, key) {
    if (this.db) {
      try {
        const result = await new Promise((resolve) => {
          try {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(undefined);
          } catch {
            resolve(undefined);
          }
        });
        if (result !== undefined) return result;
      } catch {
        /* fall through to memory */
      }
    }
    return this._memory.get(this._memKey(storeName, key));
  }

  async getAll(storeName) {
    if (this.db) {
      try {
        const result = await new Promise((resolve) => {
          try {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          } catch {
            resolve([]);
          }
        });
        if (result.length) return result;
      } catch {
        /* fall through */
      }
    }
    const prefix = `${storeName}::`;
    const out = [];
    for (const [k, v] of this._memory) {
      if (k.startsWith(prefix)) out.push(v);
    }
    return out;
  }

  async delete(storeName, key) {
    this._memory.delete(this._memKey(storeName, key));
    if (!this.db) return true;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  _handleQuota(err) {
    if (!err) return;
    const msg = String(err.message || err.name || err);
    if (/quota|QuotaExceeded/i.test(msg) && !this._quotaWarned) {
      this._quotaWarned = true;
      console.warn('[Trosmos Storage] Storage quota exceeded. Some data may not persist.');
    }
  }
}

export default StorageManager;
