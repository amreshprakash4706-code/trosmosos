import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { exportUserData, importUserData } from '../services/backup.service.js';
import { audit } from '../services/auth.service.js';
import { enqueueJob } from '../services/jobs.service.js';

const router = Router();
router.use(requireAuth);
router.get('/export', asyncHandler(async (req, res) => {
  const data = exportUserData(req.user.id);
  audit(req.user.id, 'backup.export', 'backup', null, { files: data.files.length }, req);
  res.json(data);
}));
router.post('/import', asyncHandler(async (req, res) => {
  const payload = req.body?.backup || req.body;
  const result = importUserData(req.user.id, payload, { overwrite: Boolean(req.body?.overwrite) });
  audit(req.user.id, 'backup.import', 'backup', null, result, req);
  res.json(result);
}));
router.post('/export-job', asyncHandler(async (req, res) => {
  res.status(202).json(enqueueJob(req.user.id, { type: 'export_backup', title: 'Export Trosmos backup' }));
}));
export default router;
