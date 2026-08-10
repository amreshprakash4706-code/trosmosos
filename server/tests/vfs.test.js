import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDb = join(__dirname, '../data/test-vfs.db');
process.env.DATABASE_PATH = testDb;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
if (existsSync(testDb)) unlinkSync(testDb);
try { unlinkSync(testDb + '-wal'); } catch {}
try { unlinkSync(testDb + '-shm'); } catch {}

const { getDb, closeDb } = await import('../src/db.js');
const vfs = await import('../src/services/vfs.service.js');
const { registerUser } = await import('../src/services/auth.service.js');
let userId;

before(async () => {
  getDb();
  const user = await registerUser({ username: 'vfstest_' + Date.now(), password: 'password12345', displayName: 'VFS Test' });
  userId = user.id;
});
after(() => {
  closeDb();
  try { unlinkSync(testDb); } catch {}
  try { unlinkSync(testDb + '-wal'); } catch {}
  try { unlinkSync(testDb + '-shm'); } catch {}
});

test('list Home has default folders', () => {
  const names = vfs.listDirectory(userId, '/Home').map((i) => i.name);
  assert.ok(names.includes('Documents'));
});
test('create folder and file', () => {
  const folder = vfs.createFolder(userId, '/Home/Documents', 'Projects');
  assert.equal(folder.path, '/Home/Documents/Projects');
  const file = vfs.createFile(userId, '/Home/Documents/Projects', 'readme.md', '# Hello');
  assert.equal(vfs.readFile(userId, file.path).content, '# Hello');
});
test('rename directory updates descendant paths', () => {
  vfs.renameNode(userId, '/Home/Documents/Projects', 'Work');
  const after = vfs.listDirectory(userId, '/Home/Documents/Work');
  assert.ok(after.some((f) => f.name === 'readme.md'));
});
test('move directory preserves subtree', () => {
  vfs.createFolder(userId, '/Home', 'Archive');
  vfs.moveNode(userId, '/Home/Documents/Work', '/Home/Archive');
  assert.ok(vfs.listDirectory(userId, '/Home/Archive/Work').some((f) => f.name === 'readme.md'));
});
test('copy file and directory', () => {
  const copied = vfs.copyNode(userId, '/Home/Archive/Work/readme.md', '/Home/Documents', 'copy.md');
  assert.equal(vfs.readFile(userId, copied.path).content, '# Hello');
  const dirCopy = vfs.copyNode(userId, '/Home/Archive/Work', '/Home/Documents', 'WorkCopy');
  assert.ok(vfs.listDirectory(userId, dirCopy.path).some((f) => f.name === 'readme.md'));
});
test('trash and restore', () => {
  vfs.trashNode(userId, '/Home/Documents/copy.md');
  assert.throws(() => vfs.readFile(userId, '/Home/Documents/copy.md'));
  vfs.restoreNode(userId, '/Home/Documents/copy.md');
  assert.equal(vfs.readFile(userId, '/Home/Documents/copy.md').content, '# Hello');
});
test('permanent delete frees storage', () => {
  const before = vfs.getStorageStats(userId).used;
  vfs.permanentlyDelete(userId, '/Home/Documents/copy.md');
  assert.ok(vfs.getStorageStats(userId).used < before);
});
test('cannot move folder into itself', () => {
  assert.throws(() => vfs.moveNode(userId, '/Home/Archive/Work', '/Home/Archive/Work'), /itself/i);
});
test('path traversal neutralized', () => {
  assert.throws(() => vfs.listDirectory(userId, '/Home/../../etc'), /not found/i);
  const f = vfs.createFolder(userId, '/Home', '..secret');
  assert.ok(!f.path.includes('..'));
});
test('quota enforcement', () => {
  assert.throws(() => vfs.createFile(userId, '/Home/Documents', 'huge.txt', 'x'.repeat(6 * 1024 * 1024)), /maximum size|quota/i);
});
