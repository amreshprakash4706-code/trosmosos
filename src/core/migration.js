/**
 * Trosmos OS 4.0 — Database Migration Engine
 * Versioned migrations for IndexedDB schema / data shape changes.
 */

const CURRENT_VERSION = 4;

const MIGRATIONS = {
  1: async (storage) => {
    // Baseline — ensure stores exist (handled by StorageManager)
    return true;
  },
  2: async (storage) => {
    // Add trash namespace if missing
    try {
      const trash = await storage.get('trash', 'items');
      if (!trash) await storage.put('trash', { id: 'items', data: [] });
    } catch (_) {}
    return true;
  },
  3: async (storage) => {
    // Normalize settings shape
    try {
      const prefs = await storage.get('settings', 'prefs');
      if (prefs?.data && !prefs.data.theme) {
        prefs.data.theme = 'system';
        await storage.put('settings', prefs);
      }
    } catch (_) {}
    return true;
  },
  4: async (storage) => {
    // Ensure audit, clipboard, workspaces stores have seed records
    const seeds = [
      ['audit', 'log', []],
      ['clipboard', 'history', []],
      ['workspaces', 'state', null],
      ['recents', 'items', []]
    ];
    for (const [store, id, data] of seeds) {
      try {
        const existing = await storage.get(store, id);
        if (!existing && data !== null) {
          await storage.put(store, { id, data });
        }
      } catch (_) {}
    }
    return true;
  }
};

export class MigrationEngine {
  constructor(storage) {
    this.storage = storage;
  }

  async run() {
    let version = 0;
    try {
      const meta = await this.storage.get('meta', 'schema');
      version = meta?.data?.version ?? 0;
    } catch (_) {
      version = 0;
    }

    if (version >= CURRENT_VERSION) {
      return { from: version, to: version, migrated: false };
    }

    const from = version;
    for (let v = version + 1; v <= CURRENT_VERSION; v++) {
      const fn = MIGRATIONS[v];
      if (typeof fn === 'function') {
        try {
          await fn(this.storage);
          console.log(`[Migration] Applied v${v}`);
        } catch (err) {
          console.error(`[Migration] Failed at v${v}:`, err);
          throw err;
        }
      }
      await this.storage.put('meta', { id: 'schema', data: { version: v, updatedAt: Date.now() } });
    }

    return { from, to: CURRENT_VERSION, migrated: true };
  }

  get currentVersion() {
    return CURRENT_VERSION;
  }
}

export default MigrationEngine;
