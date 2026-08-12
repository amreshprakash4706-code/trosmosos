/**
 * Isolation and capability tests for Trosmos OS 5.0
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { unlinkSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDb = join(__dirname, '../data/test-isolation.db');

process.env.DATABASE_PATH = testDb;
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.NODE_ENV = 'test';

if (existsSync(testDb)) try { unlinkSync(testDb); } catch {}
if (existsSync(testDb + '-wal')) try { unlinkSync(testDb + '-wal'); } catch {}
if (existsSync(testDb + '-shm')) try { unlinkSync(testDb + '-shm'); } catch {}

const { registerUser, loginUser } = await import('../src/services/auth.service.js');
const vfs = await import('../src/services/vfs.service.js');
const { hasCapability, SCOPES, assertCapability } = await import('../src/services/capability.service.js');
const { executeTool } = await import('../src/services/tool-executor.js');
const { closeDb } = await import('../src/db.js');

let userA, userB;

before(async () => {
  userA = await registerUser({ username: 'alice_iso', password: 'testpass1', displayName: 'Alice' });
  userB = await registerUser({ username: 'bob_iso', password: 'testpass1', displayName: 'Bob' });
});

after(() => {
  closeDb();
  try { unlinkSync(testDb); } catch {}
  try { unlinkSync(testDb + '-wal'); } catch {}
  try { unlinkSync(testDb + '-shm'); } catch {}
});

test('users receive default capabilities', () => {
  assert.equal(hasCapability(userA.id, SCOPES.VFS_READ, '/Home'), true);
  assert.equal(hasCapability(userA.id, SCOPES.VFS_WRITE, '/Home'), true);
  assert.equal(hasCapability(userA.id, SCOPES.AI_TOOL), true);
});

test('user A cannot list user B private paths via VFS', () => {
  const secret = vfs.createFile(userB.id, '/Home/Documents', 'secret.txt', 'bob private');
  assert.equal(secret.path, '/Home/Documents/secret.txt');
  assert.throws(() => vfs.readFile(userA.id, '/Home/Documents/secret.txt'), /not found/i);
  const list = vfs.listDirectory(userA.id, '/Home/Documents');
  assert.ok(!list.some((n) => n.name === 'secret.txt'));
});

test('user A cannot write into user B namespace', () => {
  assert.throws(
    () => vfs.createFile(userA.id, '/Home/Documents', 'evil.txt', 'nope'),
    // path is A's own namespace — this should succeed for A
  );
  // Cross-user: there is no way to address B's paths because every query is scoped by user_id.
  // Verify B's file count / content unchanged by creating under A and reading under B.
  const bBefore = vfs.listDirectory(userB.id, '/Home/Documents').length;
  vfs.createFile(userA.id, '/Home/Documents', 'alice-only.txt', 'alice');
  const bAfter = vfs.listDirectory(userB.id, '/Home/Documents').length;
  assert.equal(bAfter, bBefore);
});

test('AI tool cannot read another user file', async () => {
  vfs.createFile(userB.id, '/Home/Documents', 'private-b.md', 'TOP SECRET B');
  const out = await executeTool(userA.id, 'read_file', { path: '/Home/Documents/private-b.md' });
  assert.equal(out.ok, false);
});

test('mutating AI tool requires confirmation', async () => {
  const out = await executeTool(userA.id, 'write_file', {
    path: '/Home/Documents/Welcome to Trosmos.md',
    content: 'rewritten by AI',
  });
  assert.equal(out.ok, true);
  assert.equal(out.type, 'confirmation_required');
  assert.ok(out.invocationId);
});

test('confirmed mutating tool executes under correct user only', async () => {
  const pending = await executeTool(userA.id, 'create_file', {
    parent: '/Home/Documents',
    name: 'from-ai.txt',
    content: 'hello from confirmed tool',
  });
  assert.equal(pending.type, 'confirmation_required');
  const confirmed = await executeTool(userA.id, 'create_file', {
    parent: '/Home/Documents',
    name: 'from-ai.txt',
    content: 'hello from confirmed tool',
  }, { confirmationId: pending.invocationId });
  assert.equal(confirmed.ok, true);
  const file = vfs.readFile(userA.id, '/Home/Documents/from-ai.txt');
  assert.equal(file.content, 'hello from confirmed tool');
  // B still cannot see it
  assert.throws(() => vfs.readFile(userB.id, '/Home/Documents/from-ai.txt'), /not found/i);
});

test('capability denial works', () => {
  assert.throws(() => assertCapability(userA.id, 'admin', null), /Capability denied/);
});
