import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDb = join(__dirname, '../data/test-api.db');
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = testDb;
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
try { rmSync(testDb); } catch {}
try { rmSync(testDb + '-wal'); } catch {}
try { rmSync(testDb + '-shm'); } catch {}
mkdirSync(dirname(testDb), { recursive: true });

const { default: app } = await import('../src/index.js');
const { closeDb } = await import('../src/db.js');

function request(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const payload = body !== undefined ? JSON.stringify(body) : undefined;
      const headers = { Accept: 'application/json', 'X-CSRF-Token': 'test-csrf' };
      headers.Cookie = 'trosmos_csrf=test-csrf';
      if (token) headers.Authorization = `Bearer ${token}`;
      if (payload) headers['Content-Type'] = 'application/json';
      const r = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          server.close();
          let json = null;
          try { json = JSON.parse(data); } catch { json = data; }
          resolve({ status: res.statusCode, json });
        });
      });
      r.on('error', (e) => { server.close(); reject(e); });
      if (payload) r.write(payload);
      r.end();
    });
  });
}

let tokenA, tokenB;
before(async () => {
  const regA = await request('POST', '/api/v1/auth/register', { body: { username: 'apia', password: 'testpass1', displayName: 'API A' } });
  assert.equal(regA.status, 201, JSON.stringify(regA.json));
  const loginA = await request('POST', '/api/v1/auth/login', { body: { username: 'apia', password: 'testpass1' } });
  assert.equal(loginA.status, 200);
  tokenA = loginA.json.token;
  await request('POST', '/api/v1/auth/register', { body: { username: 'apib', password: 'testpass1' } });
  const loginB = await request('POST', '/api/v1/auth/login', { body: { username: 'apib', password: 'testpass1' } });
  tokenB = loginB.json.token;
});
after(() => {
  closeDb();
  try { rmSync(testDb); } catch {}
  try { rmSync(testDb + '-wal'); } catch {}
  try { rmSync(testDb + '-shm'); } catch {}
});

test('health is public and reports 4.4.0', async () => {
  const res = await request('GET', '/api/v1/system/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.version, '4.4.0');
});

test('files require auth', async () => {
  const res = await request('GET', '/api/v1/files?path=/Home');
  assert.equal(res.status, 401);
});

test('user A cannot read user B secret file', async () => {
  const created = await request('POST', '/api/v1/files/file', {
    token: tokenB, body: { parent: '/Home/Documents', name: 'b-only.txt', content: 'secret-b' },
  });
  assert.equal(created.status, 201);
  const read = await request('GET', '/api/v1/files/read?path=/Home/Documents/b-only.txt', { token: tokenA });
  assert.equal(read.status, 404);
});

test('session list marks current session', async () => {
  const res = await request('GET', '/api/v1/auth/sessions', { token: tokenA });
  assert.equal(res.status, 200);
  assert.ok(res.json.sessions.some((s) => s.current));
});

test('ws ticket issued', async () => {
  const res = await request('POST', '/api/v1/auth/ws-ticket', { token: tokenA });
  assert.equal(res.status, 200);
  assert.ok(res.json.ticket);
});

test('ready endpoint', async () => {
  const res = await request('GET', '/api/v1/system/ready');
  assert.equal(res.status, 200);
  assert.equal(res.json.ready, true);
});
