import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import * as vfs from '../services/vfs.service.js';
import { audit } from '../services/auth.service.js';
import { recordRecent, addFavorite, removeFavorite, listFavorites } from '../services/activity.service.js';
import { pushToUser } from '../websocket.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const path = req.query.path || '/Home';
  res.json({ path, items: vfs.listDirectory(req.user.id, path) });
}));
router.get('/tree', asyncHandler(async (req, res) => {
  const root = req.query.root || '/Home';
  res.json({ root, tree: vfs.getTree(req.user.id, root) });
}));
router.get('/search', asyncHandler(async (req, res) => {
  const q = req.query.q || '';
  res.json({ query: q, results: vfs.searchFiles(req.user.id, q) });
}));
router.get('/stats', asyncHandler(async (req, res) => res.json(vfs.getStorageStats(req.user.id))));
router.get('/trash', asyncHandler(async (req, res) => res.json({ items: vfs.listTrash(req.user.id) })));
router.get('/read', asyncHandler(async (req, res) => {
  if (!req.query.path) return res.status(400).json({ error: 'path required' });
  const file = vfs.readFile(req.user.id, req.query.path);
  recordRecent(req.user.id, { kind: 'file', ref: file.id, title: file.name, path: file.path });
  res.json(file);
}));
router.get('/download', asyncHandler(async (req, res) => {
  if (!req.query.path) return res.status(400).json({ error: 'path required' });
  const file = vfs.readFile(req.user.id, req.query.path);
  const buf = file.encoding === 'base64'
    ? Buffer.from(file.content || '', 'base64')
    : Buffer.from(file.content || '', 'utf8');
  res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
}));
router.get('/favorites', asyncHandler(async (req, res) => {
  res.json({ items: listFavorites(req.user.id) });
}));
router.post('/favorite', asyncHandler(async (req, res) => {
  const { path, title } = req.body || {};
  if (!path) return res.status(400).json({ error: 'path required' });
  res.json(addFavorite(req.user.id, path, title));
}));
router.delete('/favorite', asyncHandler(async (req, res) => {
  const path = req.query.path || req.body?.path;
  if (!path) return res.status(400).json({ error: 'path required' });
  res.json(removeFavorite(req.user.id, path));
}));
router.post('/empty-trash', asyncHandler(async (req, res) => {
  const result = vfs.emptyTrash(req.user.id);
  audit(req.user.id, 'file.empty_trash', 'file', null, result, req);
  pushToUser(req.user.id, { type: 'vfs.changed', payload: { action: 'empty-trash' } });
  res.json(result);
}));
router.patch('/metadata', asyncHandler(async (req, res) => {
  const { path, metadata } = req.body || {};
  if (!path) return res.status(400).json({ error: 'path required' });
  res.json(vfs.setMetadata(req.user.id, path, metadata || {}));
}));
router.post('/upload', asyncHandler(async (req, res) => {
  const { parent, name, content, encoding } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  let body = content || '';
  if (encoding === 'base64' && typeof content === 'string') {
    try { body = Buffer.from(content, 'base64'); }
    catch { return res.status(400).json({ error: 'invalid base64' }); }
  }
  const unique = vfs.uniqueName(req.user.id, parent || '/Home/Downloads', name);
  const node = vfs.createFile(req.user.id, parent || '/Home/Downloads', unique, body);
  audit(req.user.id, 'file.upload', 'file', node.id, { path: node.path }, req);
  pushToUser(req.user.id, { type: 'vfs.changed', payload: { action: 'upload', path: node.path } });
  res.status(201).json(node);
}));
router.get('/versions', asyncHandler(async (req, res) => {
  if (!req.query.path) return res.status(400).json({ error: 'path required' });
  res.json(vfs.listVersions(req.user.id, req.query.path));
}));
router.post('/restore-version', asyncHandler(async (req, res) => {
  const { path, version } = req.body || {};
  if (!path || version == null) return res.status(400).json({ error: 'path and version required' });
  const file = vfs.restoreVersion(req.user.id, path, version);
  audit(req.user.id, 'file.restore_version', 'file', file.id, { path, version }, req);
  res.json(file);
}));
router.post('/folder', asyncHandler(async (req, res) => {
  const { parent, name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const node = vfs.createFolder(req.user.id, parent || '/Home', name);
  audit(req.user.id, 'file.mkdir', 'file', node.id, { path: node.path }, req);
  pushToUser(req.user.id, { type: 'vfs.changed', payload: { action: 'mkdir', path: node.path } });
  res.status(201).json(node);
}));
router.post('/file', asyncHandler(async (req, res) => {
  const { parent, name, content } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const node = vfs.createFile(req.user.id, parent || '/Home/Documents', name, content || '');
  audit(req.user.id, 'file.create', 'file', node.id, { path: node.path }, req);
  res.status(201).json(node);
}));
router.put('/write', asyncHandler(async (req, res) => {
  const { path, content } = req.body || {};
  if (!path) return res.status(400).json({ error: 'path required' });
  const file = vfs.writeFile(req.user.id, path, content ?? '');
  audit(req.user.id, 'file.write', 'file', file.id, { path }, req);
  res.json(file);
}));
router.post('/rename', asyncHandler(async (req, res) => {
  const { path, name } = req.body || {};
  if (!path || !name) return res.status(400).json({ error: 'path and name required' });
  const node = vfs.renameNode(req.user.id, path, name);
  audit(req.user.id, 'file.rename', 'file', node.id, { path: node.path }, req);
  res.json(node);
}));
router.post('/move', asyncHandler(async (req, res) => {
  const { path, destination } = req.body || {};
  if (!path || !destination) return res.status(400).json({ error: 'path and destination required' });
  const node = vfs.moveNode(req.user.id, path, destination);
  audit(req.user.id, 'file.move', 'file', node.id, { path: node.path }, req);
  res.json(node);
}));
router.post('/copy', asyncHandler(async (req, res) => {
  const { path, destination, name } = req.body || {};
  if (!path || !destination) return res.status(400).json({ error: 'path and destination required' });
  const node = vfs.copyNode(req.user.id, path, destination, name);
  audit(req.user.id, 'file.copy', 'file', node.id, { path: node.path }, req);
  res.status(201).json(node);
}));
router.post('/trash', asyncHandler(async (req, res) => {
  const { path } = req.body || {};
  if (!path) return res.status(400).json({ error: 'path required' });
  const result = vfs.trashNode(req.user.id, path);
  audit(req.user.id, 'file.trash', 'file', null, { path }, req);
  res.json(result);
}));
router.post('/restore', asyncHandler(async (req, res) => {
  const { path } = req.body || {};
  if (!path) return res.status(400).json({ error: 'path required' });
  const node = vfs.restoreNode(req.user.id, path);
  audit(req.user.id, 'file.restore', 'file', node.id, { path }, req);
  res.json(node);
}));
router.delete('/', asyncHandler(async (req, res) => {
  const path = req.query.path || req.body?.path;
  if (!path) return res.status(400).json({ error: 'path required' });
  const result = vfs.permanentlyDelete(req.user.id, path);
  audit(req.user.id, 'file.delete', 'file', null, { path }, req);
  res.json(result);
}));

export default router;
