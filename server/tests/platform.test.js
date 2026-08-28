import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDb = join(__dirname, '../data/test-platform.db');
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = testDb;
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.MAX_FILE_SIZE_BYTES = String(5 * 1024 * 1024);
try { rmSync(testDb); } catch {}
try { rmSync(testDb + '-wal'); } catch {}
try { rmSync(testDb + '-shm'); } catch {}
mkdirSync(dirname(testDb), { recursive: true });

const { getDb, closeDb } = await import('../src/db.js');
const { registerUser } = await import('../src/services/auth.service.js');
const vfs = await import('../src/services/vfs.service.js');
const activity = await import('../src/services/activity.service.js');
const workspaces = await import('../src/services/workspace.service.js');
const notes = await import('../src/services/notes.service.js');
const jobs = await import('../src/services/jobs.service.js');
const backup = await import('../src/services/backup.service.js');
const { executeTool } = await import('../src/services/tool-executor.js');
const { issueWsTicket, consumeWsTicket } = await import('../src/services/tickets.service.js');

let userA, userB;
before(async () => {
  getDb();
  userA = await registerUser({ username: 'plat_a', password: 'testpass1', displayName: 'A' });
  userB = await registerUser({ username: 'plat_b', password: 'testpass1', displayName: 'B' });
});
after(() => {
  closeDb();
  try { rmSync(testDb); } catch {}
  try { rmSync(testDb + '-wal'); } catch {}
  try { rmSync(testDb + '-shm'); } catch {}
});

test('default workspace is created', () => {
  const list = workspaces.ensureDefaultWorkspace(userA.id);
  assert.ok(list.length >= 1);
  assert.equal(list.filter((w) => w.isActive).length, 1);
});

test('workspace switch isolates users', () => {
  const second = workspaces.createWorkspace(userA.id, 'Research');
  const after = workspaces.switchWorkspace(userA.id, second.id);
  assert.ok(after.find((w) => w.id === second.id).isActive);
  const b = workspaces.ensureDefaultWorkspace(userB.id);
  assert.ok(!b.some((w) => w.id === second.id));
});

test('favorites and recents are per-user', () => {
  activity.addFavorite(userA.id, '/Home/Documents', 'Docs');
  activity.recordRecent(userA.id, { kind: 'file', ref: 'x', title: 'Welcome', path: '/Home/Documents/Welcome to Trosmos.md' });
  assert.equal(activity.listFavorites(userA.id).length, 1);
  assert.equal(activity.listFavorites(userB.id).length, 0);
  assert.ok(activity.listRecent(userA.id).length >= 1);
  assert.equal(activity.listRecent(userB.id).length, 0);
});

test('notes persist and isolate', () => {
  const n = notes.createNote(userA.id, { title: 'Plan', content: '# Plan\nDo the work.' });
  assert.ok(n.id);
  assert.equal(notes.getNote(userA.id, n.id).content.includes('Do the work'), true);
  let denied = false;
  try { notes.getNote(userB.id, n.id); } catch (e) { denied = e.status === 404; }
  assert.ok(denied);
});

test('empty trash deletes trashed nodes', () => {
  const f = vfs.createFile(userA.id, '/Home/Documents', 'to-trash.txt', 'gone soon');
  vfs.trashNode(userA.id, f.path);
  assert.ok(vfs.listTrash(userA.id).length >= 1);
  const result = vfs.emptyTrash(userA.id);
  assert.ok(result.deleted >= 1);
  assert.equal(vfs.listTrash(userA.id).length, 0);
});

test('inspect_folder job completes', async () => {
  const job = jobs.enqueueJob(userA.id, { type: 'inspect_folder', title: 'Inspect Home', payload: { path: '/Home' } });
  jobs.kick();
  for (let i = 0; i < 20; i++) {
    const cur = jobs.getJob(userA.id, job.id);
    if (cur.status === 'completed' || cur.status === 'failed') {
      assert.equal(cur.status, 'completed');
      assert.ok(cur.result && typeof cur.result.files === 'number');
      return;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail('job did not finish');
});

test('backup export excludes other users', () => {
  vfs.createFile(userB.id, '/Home/Documents', 'bob-secret.md', 'classified-b');
  const dump = backup.exportUserData(userA.id);
  assert.equal(dump.format, 'trosmos-backup');
  assert.ok(!dump.files.some((f) => f.name === 'bob-secret.md'));
});

test('ws ticket is single-use', () => {
  const { ticket } = issueWsTicket(userA.id);
  assert.equal(consumeWsTicket(ticket), userA.id);
  assert.equal(consumeWsTicket(ticket), null);
});

test('AI empty_trash requires confirmation', async () => {
  const out = await executeTool(userA.id, 'empty_trash', {});
  assert.equal(out.type, 'confirmation_required');
});

test('AI inspect_folder returns real counts', async () => {
  const out = await executeTool(userA.id, 'inspect_folder', { path: '/Home' });
  assert.equal(out.ok, true);
  assert.ok(typeof out.result.nodes === 'number');
});
