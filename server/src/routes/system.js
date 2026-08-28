import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { config } from '../config.js';
import { getDb } from '../db.js';
import * as vfs from '../services/vfs.service.js';
import os from 'os';

const router = Router();

router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const db = getDb();
    let dbOk = false;
    try {
      db.prepare('SELECT 1').get();
      dbOk = true;
    } catch {
      dbOk = false;
    }
    res.json({
      status: dbOk ? 'ok' : 'degraded',
      version: config.version,
      name: config.name,
      time: new Date().toISOString(),
      database: dbOk ? 'connected' : 'error',
      ai: config.aiEnabled ? 'configured' : 'not_configured',
      uptime: process.uptime(),
    });
  })
);

router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    const db = getDb();
    try {
      db.prepare('SELECT 1').get();
      res.json({ ready: true, version: config.version });
    } catch (e) {
      res.status(503).json({ ready: false, error: 'database unavailable' });
    }
  })
);

router.get(
  '/info',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json({
      name: config.name,
      version: config.version,
      environment: config.env,
      features: {
        auth: true,
        vfs: true,
        ai: config.aiEnabled,
        websockets: true,
        multiUser: true,
        offline: true,
      },
      limits: {
        maxStorageBytes: config.maxStorageBytes,
        maxFileSizeBytes: config.maxFileSizeBytes,
        maxFilesPerUser: config.maxFilesPerUser,
      },
      user: req.user
        ? {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role,
          }
        : null,
    });
  })
);

router.get(
  '/diagnostics',
  requireAuth,
  asyncHandler(async (req, res) => {
    const stats = vfs.getStorageStats(req.user.id);
    const db = getDb();
    const notifCount = db
      .prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(req.user.id);

    // Honest browser/host metrics only where available — no fake CPU/RAM for the OS itself
    res.json({
      user: req.user,
      storage: stats,
      unreadNotifications: notifCount?.c || 0,
      server: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsage: process.memoryUsage(),
        // Host load is real process metrics, not fabricated OS metrics
        loadAverage: os.loadavg(),
        freeMem: os.freemem(),
        totalMem: os.totalmem(),
      },
      time: new Date().toISOString(),
    });
  })
);

export default router;
