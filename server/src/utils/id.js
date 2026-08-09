import { randomBytes, createHash } from 'crypto';

export function uid(prefix = '') {
  const id = randomBytes(16).toString('hex');
  return prefix ? `${prefix}_${id}` : id;
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function safeName(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 255) || 'untitled';
}

export function normalizePath(input) {
  let p = String(input || '/').replace(/\\/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  const parts = p.split('/').filter((seg) => seg && seg !== '.' && seg !== '..');
  return '/' + parts.join('/');
}

export function parentPath(path) {
  const n = normalizePath(path);
  if (n === '/') return null;
  const idx = n.lastIndexOf('/');
  return idx <= 0 ? '/' : n.slice(0, idx);
}

export function joinPath(...parts) {
  const joined = parts
    .map((p) => String(p || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return normalizePath('/' + joined);
}

export function mimeFromName(name) {
  const ext = (name || '').split('.').pop()?.toLowerCase() || '';
  const map = {
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    ts: 'text/typescript',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    pdf: 'application/pdf',
    zip: 'application/zip',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
  };
  return map[ext] || 'application/octet-stream';
}
