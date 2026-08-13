/**
 * Trosmos OS 5.0 database layer.
 * node:sqlite (DatabaseSync) — no native addons.
 * Versioned migrations + capability / AI invocation tables.
 */
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

let db = null;

class Statement {
  constructor(raw) {
    this._raw = raw;
  }
  get(...params) {
    return this._raw.get(...params) ?? undefined;
  }
  all(...params) {
    return this._raw.all(...params) ?? [];
  }
  run(...params) {
    const result = this._raw.run(...params);
    return {
      changes: result?.changes ?? 0,
      lastInsertRowid: result?.lastInsertRowid ?? 0,
    };
  }
}

class Database {
  constructor(path) {
    this._db = new DatabaseSync(path);
    this._db.exec('PRAGMA journal_mode = WAL');
    this._db.exec('PRAGMA foreign_keys = ON');
    this._db.exec('PRAGMA busy_timeout = 5000');
  }
  prepare(sql) {
    return new Statement(this._db.prepare(sql));
  }
  exec(sql) {
    this._db.exec(sql);
  }
  pragma(pragmaStr) {
    const m = String(pragmaStr).match(/^(\w+)\s*=\s*(.+)$/);
    if (m) {
      this._db.exec(`PRAGMA ${m[1]} = ${m[2]}`);
      return;
    }
    try {
      return this._db.prepare(`PRAGMA ${pragmaStr}`).get();
    } catch {
      return undefined;
    }
  }
  transaction(fn) {
    const self = this;
    return function runTransaction(...args) {
      self._db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn(...args);
        self._db.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          self._db.exec('ROLLBACK');
        } catch (_) {}
        throw err;
      }
    };
  }
  close() {
    try {
      this._db.close();
    } catch (_) {}
  }
}

export function getDb() {
  if (db) return db;
  const dir = dirname(config.dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  db = new Database(config.dbPath);
  migrate(db);
  return db;
}

const MIGRATIONS = [
  {
    version: 1,
    name: 'baseline_4_2_1',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          email TEXT UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          display_name TEXT,
          avatar_url TEXT,
          role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
          storage_used INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          failed_login_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until TEXT,
          last_login_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL,
          user_agent TEXT,
          ip TEXT,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          parent_id TEXT REFERENCES files(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          is_dir INTEGER NOT NULL DEFAULT 0,
          mime_type TEXT,
          size INTEGER NOT NULL DEFAULT 0,
          content TEXT,
          content_blob BLOB,
          is_trashed INTEGER NOT NULL DEFAULT 0,
          trashed_at TEXT,
          original_path TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          metadata TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id, path)
        );

        CREATE TABLE IF NOT EXISTS settings (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (user_id, key)
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          body TEXT,
          type TEXT NOT NULL DEFAULT 'info',
          icon TEXT,
          data TEXT,
          is_read INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS apps_installed (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          app_id TEXT NOT NULL,
          version TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          settings TEXT,
          installed_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id, app_id)
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','cancelled')),
          progress REAL DEFAULT 0,
          payload TEXT,
          result TEXT,
          error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          action TEXT NOT NULL,
          resource TEXT,
          resource_id TEXT,
          details TEXT,
          ip TEXT,
          user_agent TEXT,
          correlation_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ai_conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT,
          messages TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT,
          user_agent TEXT,
          last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_files_user_path ON files(user_id, path);
        CREATE INDEX IF NOT EXISTS idx_files_user_parent ON files(user_id, parent_id);
        CREATE INDEX IF NOT EXISTS idx_files_user_trashed ON files(user_id, is_trashed);
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
        CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_settings_user ON settings(user_id);
        CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id);
      `);
    },
  },
  {
    version: 2,
    name: '5_0_capabilities_and_ai_invocations',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS capabilities (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          scope TEXT NOT NULL,
          resource TEXT,
          granted_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT,
          UNIQUE(user_id, scope, resource)
        );

        CREATE TABLE IF NOT EXISTS ai_tool_invocations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          conversation_id TEXT,
          tool_name TEXT NOT NULL,
          args_json TEXT NOT NULL,
          result_json TEXT,
          status TEXT NOT NULL CHECK(status IN ('pending','confirmed','executed','failed','denied','cancelled')),
          requires_confirmation INTEGER NOT NULL DEFAULT 0,
          correlation_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          executed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_capabilities_user ON capabilities(user_id, scope);
        CREATE INDEX IF NOT EXISTS idx_ai_inv_user ON ai_tool_invocations(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_ai_inv_corr ON ai_tool_invocations(correlation_id);
      `);

      // Additive columns for existing 4.2.1 DBs
      try { database.exec(`ALTER TABLE sessions ADD COLUMN idle_expires_at TEXT`); } catch (_) {}
      try { database.exec(`ALTER TABLE sessions ADD COLUMN device_fingerprint TEXT`); } catch (_) {}
      try { database.exec(`ALTER TABLE audit_logs ADD COLUMN correlation_id TEXT`); } catch (_) {}
      try { database.exec(`ALTER TABLE files ADD COLUMN content_hash TEXT`); } catch (_) {}
    },
  },
  {
    version: 3,
    name: '4_3_file_versions_binary_and_indexes',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS file_versions (
          id TEXT PRIMARY KEY,
          file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          version INTEGER NOT NULL,
          size INTEGER NOT NULL DEFAULT 0,
          content TEXT,
          content_blob BLOB,
          content_hash TEXT,
          mime_type TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(file_id, version)
        );

        CREATE INDEX IF NOT EXISTS idx_file_versions_file ON file_versions(file_id, version DESC);
        CREATE INDEX IF NOT EXISTS idx_file_versions_user ON file_versions(user_id);
        CREATE INDEX IF NOT EXISTS idx_files_user_hash ON files(user_id, content_hash);
        CREATE INDEX IF NOT EXISTS idx_files_mime ON files(user_id, mime_type);
      `);
      try { database.exec(`ALTER TABLE files ADD COLUMN content_blob BLOB`); } catch (_) {}
      try { database.exec(`ALTER TABLE files ADD COLUMN content_hash TEXT`); } catch (_) {}
    },
  },
];

function migrate(database) {
  // Ensure migrations table exists even on brand-new DB
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    database.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    const tx = database.transaction(() => {
      m.up(database);
      database.prepare(
        `INSERT INTO schema_migrations (version, name) VALUES (?, ?)`
      ).run(m.version, m.name);
    });
    tx();
    console.log(`[db] applied migration v${m.version}: ${m.name}`);
  }

  // Legacy safety for pure 4.2.1 DBs that never ran migrations
  try { database.exec(`ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
  try { database.exec(`ALTER TABLE users ADD COLUMN locked_until TEXT`); } catch (_) {}
  try { database.exec(`ALTER TABLE files ADD COLUMN original_path TEXT`); } catch (_) {}
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export function cleanupExpired() {
  try {
    const d = getDb();
    d.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();
    d.prepare(`DELETE FROM audit_logs WHERE created_at < datetime('now', '-90 days')`).run();
    d.prepare(`DELETE FROM ai_tool_invocations WHERE status = 'pending' AND created_at < datetime('now', '-1 hour')`).run();
  } catch (e) {
    console.error('[db cleanup]', e.message);
  }
}

export default { getDb, closeDb, cleanupExpired };
