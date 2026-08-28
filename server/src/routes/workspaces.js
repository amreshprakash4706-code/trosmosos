import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import * as ws from '../services/workspace.service.js';

const router = Router();
router.use(requireAuth);
router.get('/', asyncHandler(async (req, res) => { res.json({ workspaces: ws.ensureDefaultWorkspace(req.user.id) }); }));
router.post('/', asyncHandler(async (req, res) => { res.status(201).json(ws.createWorkspace(req.user.id, req.body?.name, req.body?.state)); }));
router.put('/:id', asyncHandler(async (req, res) => { res.json(ws.updateWorkspace(req.user.id, req.params.id, req.body || {})); }));
router.post('/:id/switch', asyncHandler(async (req, res) => { res.json({ workspaces: ws.switchWorkspace(req.user.id, req.params.id) }); }));
router.delete('/:id', asyncHandler(async (req, res) => { res.json({ workspaces: ws.deleteWorkspace(req.user.id, req.params.id) }); }));
export default router;
