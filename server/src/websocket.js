import { WebSocketServer } from 'ws';
import { validateSession, getUserById } from './services/auth.service.js';
import { parse as parseUrl } from 'url';
import { config } from './config.js';
import { consumeWsTicket } from './services/tickets.service.js';

const userSockets = new Map();

function extractAuth(req) {
  const cookieHeader = req.headers?.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2).map(([k, v]) => [k, decodeURIComponent(v)])
  );
  const { query } = parseUrl(req.url, true);
  return {
    cookieToken: cookies[config.sessionCookieName] || '',
    ticket: query?.ticket || '',
    token: query?.token || '',
  };
}

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const auth = extractAuth(req);
    let user = null;
    if (auth.ticket) {
      const uid = consumeWsTicket(auth.ticket);
      if (uid) user = getUserById(uid);
    }
    if (!user && auth.cookieToken) user = validateSession(auth.cookieToken);
    if (!user && auth.token) user = validateSession(auth.token);
    if (!user) { ws.close(4001, 'Unauthorized'); return; }
    ws.userId = user.id; ws.isAlive = true;
    if (!userSockets.has(user.id)) userSockets.set(user.id, new Set());
    userSockets.get(user.id).add(ws);
    ws.send(JSON.stringify({ type: 'connected', payload: { userId: user.id, username: user.username, ts: Date.now() } }));
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg?.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        if (msg?.type === 'subscribe' && typeof msg.channel === 'string') {
          ws.channel = String(msg.channel).slice(0, 64);
          ws.send(JSON.stringify({ type: 'subscribed', channel: ws.channel }));
        }
      } catch {}
    });
    ws.on('close', () => {
      const set = userSockets.get(user.id);
      if (set) { set.delete(ws); if (set.size === 0) userSockets.delete(user.id); }
    });
    ws.on('error', () => { try { ws.close(); } catch {} });
  });
  const interval = setInterval(() => {
    for (const clients of userSockets.values()) {
      for (const ws of clients) {
        if (!ws.isAlive) { try { ws.terminate(); } catch {} continue; }
        ws.isAlive = false;
        try { ws.ping(); } catch {}
      }
    }
  }, 30000);
  interval.unref?.();
  wss.on('close', () => clearInterval(interval));
  return wss;
}

export function pushToUser(userId, event) {
  const set = userSockets.get(userId);
  if (!set || set.size === 0) return 0;
  const payload = typeof event === 'string' ? event : JSON.stringify(event);
  let sent = 0;
  for (const ws of set) {
    if (ws.readyState === 1) { try { ws.send(payload); sent++; } catch {} }
  }
  return sent;
}
export const broadcastToUser = pushToUser;
export function pushToAll(event) {
  let total = 0;
  for (const userId of userSockets.keys()) total += pushToUser(userId, event);
  return total;
}
export function getOnlineUserCount() { return userSockets.size; }
export function getConnectionCount() {
  let n = 0; for (const set of userSockets.values()) n += set.size; return n;
}
