import { WebSocketServer } from 'ws';
import { validateSession } from './services/auth.service.js';
import { parse as parseUrl } from 'url';

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const userSockets = new Map();

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const { query } = parseUrl(req.url, true);
    const token = query?.token || '';
    const user = validateSession(token);

    if (!user) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    ws.userId = user.id;
    ws.isAlive = true;

    if (!userSockets.has(user.id)) userSockets.set(user.id, new Set());
    userSockets.get(user.id).add(ws);

    ws.send(
      JSON.stringify({
        type: 'connected',
        payload: { userId: user.id, username: user.username, time: new Date().toISOString() },
      })
    );

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
        }
      } catch {
        // ignore invalid
      }
    });

    ws.on('close', () => {
      const set = userSockets.get(user.id);
      if (set) {
        set.delete(ws);
        if (set.size === 0) userSockets.delete(user.id);
      }
    });
  });

  // Heartbeat
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  return wss;
}

export function broadcastToUser(userId, message) {
  const set = userSockets.get(userId);
  if (!set) return;
  const data = JSON.stringify(message);
  for (const ws of set) {
    if (ws.readyState === 1) ws.send(data);
  }
}

export function broadcastAll(message) {
  const data = JSON.stringify(message);
  for (const set of userSockets.values()) {
    for (const ws of set) {
      if (ws.readyState === 1) ws.send(data);
    }
  }
}
