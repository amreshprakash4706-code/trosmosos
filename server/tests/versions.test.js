/**
 * File versioning tests for Trosmos OS 4.3
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDb = join(__dirname, '../data/test-versions.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = testDb;
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.MAX_FILE_SIZE_BYTES = String(5 * 1024 * 1024);

try { rmSync(testDb); } catch {}
try { rmSync(testDb + '-wal'); } catch {}
try { rmSync(testDb + '-shm'); } catch {}
mkdirSync(dirname(testDb), { recursive: true });

const { getDb, closeDb } = await import('../src/db.js');
const vfs = await import('../src/services/vfs.service.js');
const { registerUser } = await import('../src/services/auth.service.js');

let userId;

before(() => { getDb(); });
after(() => {
  closeDb();
  try { rmSync(testDb); } catch {}
  try { rmSync(testDb + '-wal'); } catch {}
  try { rmSync(testDb + '-shm'); } catch {}
});

test('register seeds fs', async () => {
  const user = await registerUser({ username: 'ver_tester', password: 'testpass1', displayName: 'Ver Tester' });
  assert.ok(user.id);
  userId = user.id;
});

test('write creates version history', () => {
  const file = vfs.createFile(userId, '/Home/Documents', 'note.txt', 'v1 content');
  assert.equal(file.version, 1);
  assert.equal(vfs.readFile(userId, file.path).content, 'v1 content');
  const r2 = vfs.writeFile(userId, file.path, 'v2 content');
  assert.equal(r2.version, 2);
  assert.equal(r2.content, 'v2 content');
  const hist = vfs.listVersions(userId, file.path);
  assert.equal(hist.currentVersion, 2);
  assert.ok(hist.versions.length >= 2);
});

test('restore previous version', () => {
  const path = '/Home/Documents/note.txt';
  const restored = vfs.restoreVersion(userId, path, 1);
  assert.ok(restored.version >= 3);
  assert.equal(restored.content, 'v1 content');
});

test('isolation: other user cannot read versions', async () => {
  const other = await registerUser({ username: 'ver_other', password: 'testpass1' });
  let denied = false;
  try { vfs.listVersions(other.id, '/Home/Documents/note.txt'); }
  catch (e) { denied = e.status === 404 || e.status === 403; }
  assert.ok(denied, 'cross-user version access must fail');
});
