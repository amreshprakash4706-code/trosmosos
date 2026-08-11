import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../db.js';
import { config } from '../config.js';
import { uid, hashToken } from '../utils/id.js';

export async function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptRounds);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function createToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

export async function registerUser({ username, password, email, displayName }) {
  const db = getDb();
  const uname = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_\-\.]{3,32}$/.test(uname)) {
    const err = new Error('Username must be 3-32 characters (letters, numbers, _ - .)');
    err.status = 400;
    throw err;
  }
  if (!password || password.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.status = 400;
    throw err;
  }
  if (password.length > 128) {
    const err = new Error('Password must be at most 128 characters');
    err.status = 400;
    throw err;
  }
  // Basic complexity: require at least one letter and one number
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    const err = new Error('Password must contain at least one letter and one number');
    err.status = 400;
    throw err;
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
  if (existing) {
    const err = new Error('Username already taken');
    err.status = 409;
    throw err;
  }

  if (email) {
    const e = String(email).trim().toLowerCase();
    const eExists = db.prepare('SELECT id FROM users WHERE email = ?').get(e);
    if (eExists) {
      const err = new Error('Email already registered');
      err.status = 409;
      throw err;
    }
  }

  const id = uid('usr');
  const password_hash = await hashPassword(password);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO users (id, username, email, password_hash, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    uname,
    email ? String(email).trim().toLowerCase() : null,
    password_hash,
    displayName || uname,
    now,
    now
  );

  // Seed default home folders for the user
  seedUserFilesystem(id);

  return getUserById(id);
}

export function seedUserFilesystem(userId) {
  const db = getDb();
  const roots = [
    { name: 'Home', path: '/Home', is_dir: 1 },
    { name: 'Documents', path: '/Home/Documents', is_dir: 1 },
    { name: 'Downloads', path: '/Home/Downloads', is_dir: 1 },
    { name: 'Pictures', path: '/Home/Pictures', is_dir: 1 },
    { name: 'Music', path: '/Home/Music', is_dir: 1 },
    { name: 'Videos', path: '/Home/Videos', is_dir: 1 },
    { name: 'Projects', path: '/Home/Projects', is_dir: 1 },
    { name: 'Apps', path: '/Home/Apps', is_dir: 1 },
    { name: 'Trash', path: '/Trash', is_dir: 1 },
  ];

  const insert = db.prepare(
    `INSERT OR IGNORE INTO files (id, user_id, parent_id, name, path, is_dir, size, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))`
  );

  const idMap = {};
  for (const r of roots) {
    const fid = uid('fil');
    idMap[r.path] = fid;
    const parentPath = r.path === '/Home' || r.path === '/Trash' ? null : '/Home';
    const parentId = parentPath ? idMap[parentPath] : null;
    insert.run(fid, userId, parentId, r.name, r.path);
  }

  // Welcome note
  const noteId = uid('fil');
  const notePath = '/Home/Documents/Welcome to Trosmos.md';
  db.prepare(
    `INSERT OR IGNORE INTO files (id, user_id, parent_id, name, path, is_dir, mime_type, size, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 'text/markdown', ?, ?, datetime('now'), datetime('now'))`
  ).run(
    noteId,
    userId,
    idMap['/Home/Documents'],
    'Welcome to Trosmos.md',
    notePath,
    180,
    `# Welcome to Trosmos OS

You are running a real multi-user web operating environment.

- Your files are stored securely on the server
- Settings sync across devices
- AI tools respect your permissions
- Terminal commands operate on your virtual filesystem

Enjoy the future of browser computing.
`
  );
}

export function getUserById(id) {
  const db = getDb();
  const row = db.prepare(
    `SELECT id, username, email, display_name, avatar_url, role, storage_used, is_active, last_login_at, created_at, updated_at
     FROM users WHERE id = ?`
  ).get(id);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    storageUsed: row.storage_used,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getUserByUsername(username) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username).trim());
}

export async function loginUser({ username, password, userAgent, ip }) {
  const row = getUserByUsername(username);
  // Constant-time-ish failure message to reduce enumeration
  if (!row || !row.is_active) {
    const err = new Error('Invalid username or password');
    err.status = 401;
    throw err;
  }

  // Account lockout check
  if (row.locked_until) {
    const lockedUntil = new Date(row.locked_until).getTime();
    if (lockedUntil > Date.now()) {
      const err = new Error('Account temporarily locked due to failed login attempts. Try again later.');
      err.status = 423;
      err.code = 'ACCOUNT_LOCKED';
      throw err;
    }
  }

  const ok = await verifyPassword(password, row.password_hash);
  const db = getDb();

  if (!ok) {
    const attempts = (row.failed_login_attempts || 0) + 1;
    const maxAttempts = config.maxLoginAttempts || 8;
    if (attempts >= maxAttempts) {
      const lockMs = config.loginWindowMs || 15 * 60 * 1000;
      const lockedUntil = new Date(Date.now() + lockMs).toISOString();
      db.prepare(`UPDATE users SET failed_login_attempts = ?, locked_until = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(attempts, lockedUntil, row.id);
      const err = new Error('Account temporarily locked due to failed login attempts. Try again later.');
      err.status = 423;
      err.code = 'ACCOUNT_LOCKED';
      throw err;
    }
    db.prepare(`UPDATE users SET failed_login_attempts = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(attempts, row.id);
    const err = new Error('Invalid username or password');
    err.status = 401;
    throw err;
  }

  const token = createToken({ sub: row.id, username: row.username, role: row.role });
  const sessionId = uid('ses');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sessionId, row.id, tokenHash, userAgent || null, ip || null, expiresAt);

  db.prepare(`UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now'), failed_login_attempts = 0, locked_until = NULL WHERE id = ?`).run(row.id);

  return {
    token,
    sessionId,
    user: getUserById(row.id),
    expiresAt,
  };
}

export function logoutSession(token) {
  if (!token) return;
  const db = getDb();
  const hash = hashToken(token);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
}

export function validateSession(token) {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub) return null;

  const db = getDb();
  const hash = hashToken(token);
  const session = db
    .prepare(
      `SELECT s.*, u.is_active FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
    )
    .get(hash);

  if (!session || !session.is_active) return null;

  db.prepare(`UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?`).run(session.id);
  return getUserById(session.user_id);
}

export function audit(userId, action, resource, resourceId, details, req) {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, details, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId || null,
      action,
      resource || null,
      resourceId || null,
      details ? JSON.stringify(details) : null,
      req?.ip || null,
      req?.headers?.['user-agent'] || null
    );
  } catch (e) {
    console.error('[audit]', e.message);
  }
}
