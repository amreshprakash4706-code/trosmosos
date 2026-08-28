import { getDb } from '../db.js';
import { uid, hashToken } from '../utils/id.js';

export function issueWsTicket(userId) {
  const raw = uid('wst');
  const hash = hashToken(raw);
  const expires = new Date(Date.now() + 60 * 1000).toISOString();
  getDb().prepare(`INSERT INTO ws_tickets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`).run(uid('tkt'), userId, hash, expires);
  return { ticket: raw, expiresAt: expires };
}

export function consumeWsTicket(raw) {
  if (!raw) return null;
  const db = getDb();
  const hash = hashToken(raw);
  const row = db.prepare(`SELECT * FROM ws_tickets WHERE token_hash = ? AND expires_at > datetime('now')`).get(hash);
  if (!row) return null;
  db.prepare('DELETE FROM ws_tickets WHERE id = ?').run(row.id);
  return row.user_id;
}

export function purgeExpiredTickets() {
  try { getDb().prepare(`DELETE FROM ws_tickets WHERE expires_at <= datetime('now')`).run(); } catch (_) {}
}
