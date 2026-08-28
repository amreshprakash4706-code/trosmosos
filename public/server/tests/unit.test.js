/**
 * Zero-dependency unit tests: path utils + node:sqlite wrapper
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path utils (inline copy of production logic for isolation)
function safeName(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 255) || 'untitled';
}
function normalizePath(input) {
  let p = String(input || '/').replace(/\\/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  const parts = p.split('/').filter((seg) => seg && seg !== '.' && seg !== '..');
  return '/' + parts.join('/');
}
function parentPath(path) {
  const n = normalizePath(path);
  if (n === '/') return null;
  const idx = n.lastIndexOf('/');
  return idx <= 0 ? '/' : n.slice(0, idx);
}

test('normalizePath strips traversal', () => {
  assert.equal(normalizePath('/Home/../../etc/passwd'), '/Home/etc/passwd'); // '..' segments are dropped, not walked
  assert.equal(normalizePath('/Home/./Documents'), '/Home/Documents');
  assert.equal(normalizePath('Home/Docs'), '/Home/Docs');
});

test('safeName strips dangerous chars', () => {
  assert.equal(safeName('../../x'), 'x');
  assert.equal(safeName('a<b>c'), 'abc');
  assert.equal(safeName(''), 'untitled');
});

test('parentPath', () => {
  assert.equal(parentPath('/Home/Documents/a.md'), '/Home/Documents');
  assert.equal(parentPath('/Home'), '/');
  assert.equal(parentPath('/'), null);
});

test('node:sqlite basic ops', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const path = join(__dirname, '../data/unit-sqlite.db');
  try { unlinkSync(path); } catch {}
  try { unlinkSync(path + '-wal'); } catch {}
  try { unlinkSync(path + '-shm'); } catch {}
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)');
  db.prepare('INSERT INTO t VALUES (?, ?)').run('1', 'hello');
  assert.equal(db.prepare('SELECT v FROM t WHERE id = ?').get('1').v, 'hello');
  db.exec('BEGIN');
  db.prepare('UPDATE t SET v = ? WHERE id = ?').run('world', '1');
  db.exec('COMMIT');
  assert.equal(db.prepare('SELECT v FROM t WHERE id = ?').get('1').v, 'world');
  db.close();
  try { unlinkSync(path); } catch {}
});
