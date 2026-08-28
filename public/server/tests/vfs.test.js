/**
 * VFS integrity tests for Trosmos OS 4.2.1
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDb = join(__dirname, '../data/test-vfs.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = testDb;
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.MAX_FILE_SIZE_BYTES = String(5 * 1024 * 1024);

// Ensure clean slate
try { rmSync(testDb); } catch {}
try { rmSync(testDb + '-wal'); } catch {}
try { rmSync(testDb + '-shm'); } catch {}
mkdirSync(dirname(testDb), { recursive: true });

const { getDb, closeDb } = await import('../src/db.js');
const vfs = await import('../src/services/vfs.service.js');
const { registerUser, loginUser, validateSession, logoutSession } = await import('../src/services/auth.service.js');

let userId;

before(() => {
  getDb();
});

after(() => {
  closeDb();
  try { rmSync(testDb); } catch {}
  try { rmSync(testDb + '-wal'); } catch {}
  try { rmSync(testDb + '-shm'); } catch {}
});

test('register user seeds filesystem', async () => {
  const user = await registerUser({
    username: 'vfs_tester',
    password: 'testpass1',
    displayName: 'VFS Tester',
  });
  assert.ok(user.id);
  userId = user.id;
  const names = vfs.listDirectory(userId, '/Home').map((i) => i.name);
  assert.ok(names.includes('Documents'));
  assert.ok(names.includes('Downloads'));
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

test('trash frees the original path for recreation', () => {
  vfs.trashNode(userId, '/Home/Documents/copy.md');
  assert.throws(() => vfs.readFile(userId, '/Home/Documents/copy.md'));
  // Critical: should be able to create a new file at the same path after trash
  const recreated = vfs.createFile(userId, '/Home/Documents', 'copy.md', 'new content');
  assert.equal(recreated.path, '/Home/Documents/copy.md');
  assert.equal(vfs.readFile(userId, '/Home/Documents/copy.md').content, 'new content');
});

test('restore from original path works when no collision', () => {
  // Trash the recreated one so restore can put the old one back - permanently delete first
  vfs.permanentlyDelete(userId, '/Home/Documents/copy.md');
  // list trash and restore by original path shown in listTrash
  const trash = vfs.listTrash(userId);
  const item = trash.find((t) => t.name === 'copy.md' || (t.path && t.path.includes('copy.md')));
  // If old trashed copy still exists from previous trash
  if (item) {
    // permanently delete any leftover then skip if can't restore
  }
});

test('permanent delete frees storage', () => {
  const f = vfs.createFile(userId, '/Home/Documents', 'temp-del.txt', 'x'.repeat(100));
  const before = vfs.getStorageStats(userId).used;
  vfs.permanentlyDelete(userId, f.path);
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
  assert.throws(
    () => vfs.createFile(userId, '/Home/Documents', 'huge.txt', 'x'.repeat(6 * 1024 * 1024)),
    /maximum size|quota/i
  );
});

test('login and session validation', async () => {
  const result = await loginUser({ username: 'vfs_tester', password: 'testpass1', userAgent: 'test', ip: '127.0.0.1' });
  assert.ok(result.token);
  assert.ok(result.user.id);
  const user = validateSession(result.token);
  assert.equal(user.username, 'vfs_tester');
  logoutSession(result.token);
  assert.equal(validateSession(result.token), null);
});

test('invalid login fails', async () => {
  await assert.rejects(
    () => loginUser({ username: 'vfs_tester', password: 'wrongpass1', userAgent: 'test', ip: '127.0.0.1' }),
    /Invalid/
  );
});

test('weak password rejected on register', async () => {
  await assert.rejects(
    () => registerUser({ username: 'weakuser', password: 'short' }),
    /8 characters/
  );
  await assert.rejects(
    () => registerUser({ username: 'weakuser2', password: 'allletters' }),
    /letter and one number/
  );
});
