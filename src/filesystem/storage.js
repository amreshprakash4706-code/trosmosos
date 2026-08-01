/**
 * Trosmos OS — StorageManager (IndexedDB)
 * Non-destructive schema migrations. Never deletes user data on upgrade.
 */

const DB_NAME = 'TrosmosOS';
const DB_VERSION = 4;

const STORE_DEFS = {
  filesystem: { keyPath: 'id' },
  settings: { keyPath: 'id' },
  windowStates: { keyPath: 'id' },
  browserHistory: { keyPath: 'id' },
  notifications: { keyPath: 'id' },
  desktopIcons: { keyPath: 'id' },
  permissions: { keyPath: 'id' },
  processes: { keyPath: 'id' }
};

export class StorageManager {
  constructor() {
    this.db = null;
    this.ready = false;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // Create missing stores only — never delete existing ones
        Object.entries(STORE_DEFS).forEach(([name, opts]) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, opts);
            console.info(`[Trosmos Storage] Created store: ${name}`);
          }
        });

        // Future migrations can go here based on oldVersion
        if (oldVersion > 0 && oldVersion < 4) {
          // e.g. migrate data shapes if needed without wiping
          console.info(`[Trosmos Storage] Migrated from v${oldVersion} → v${DB_VERSION} (non-destructive)`);
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.ready = true;
        resolve();
      };

      request.onerror = () => {
        console.error('[Trosmos Storage] IndexedDB open failed', request.error);
        // Continue in-memory mode
        this.ready = false;
        resolve();
      };
    });
  }

  async put(storeName, data) {
    if (!this.db) return false;
    if (!data || data.id == null) {
      console.warn(`StorageManager.put: missing id for store "${storeName}"`);
      return false;
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(data);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async get(storeName, key) {
    if (!this.db) return undefined;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        resolve(undefined);
      }
    });
  }

  async getAll(storeName) {
    if (!this.db) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async delete(storeName, key) {
    if (!this.db) return false;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }
}

export default StorageManager;
