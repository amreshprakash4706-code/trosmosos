import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { listRecent, listFavorites, addFavorite, removeFavorite, recordRecent } from '../services/activity.service.js';

const router = Router();
router.use(requireAuth);
router.get('/recent', asyncHandler(async (req, res) => { res.json({ items: listRecent(req.user.id, req.query.limit) }); }));
router.post('/recent', asyncHandler(async (req, res) => {
  const { kind, ref, title, path } = req.body || {};
  if (!kind || !ref) return res.status(400).json({ error: 'kind and ref required' });
  recordRecent(req.user.id, { kind, ref, title, path });
  res.status(201).json({ ok: true });
}));
router.get('/favorites', asyncHandler(async (req, res) => { res.json({ items: listFavorites(req.user.id) }); }));
router.post('/favorites', asyncHandler(async (req, res) => {
  const { path, title } = req.body || {};
  if (!path) return res.status(400).json({ error: 'path required' });
  res.status(201).json(addFavorite(req.user.id, path, title));
}));
router.delete('/favorites', asyncHandler(async (req, res) => {
  const path = req.query.path || req.body?.path;
  if (!path) return res.status(400).json({ error: 'path required' });
  res.json(removeFavorite(req.user.id, path));
}));
export default router;
