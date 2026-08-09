import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { uid } from '../utils/id.js';

const router = Router();
router.use(requireAuth);

const CATALOG = [
  {
    id: 'ai',
    name: 'Trosmos AI',
    version: '4.1.0',
    description: 'Intelligent OS copilot with structured tools',
    icon: 'fa-robot',
    category: 'System',
    builtin: true,
    permissions: ['EXECUTE'],
  },
  {
    id: 'files',
    name: 'Files',
    version: '4.1.0',
    description: 'Virtual filesystem manager',
    icon: 'fa-folder',
    category: 'System',
    builtin: true,
    permissions: ['READ', 'WRITE'],
  },
  {
    id: 'browser',
    name: 'Browser',
    version: '4.1.0',
    description: 'Web browser with tabs',
    icon: 'fa-globe',
    category: 'Internet',
    builtin: true,
    permissions: ['EXECUTE'],
  },
  {
    id: 'settings',
    name: 'Settings',
    version: '4.1.0',
    description: 'System preferences',
    icon: 'fa-gear',
    category: 'System',
    builtin: true,
    permissions: ['SYSTEM'],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    version: '4.1.0',
    description: 'Sandboxed Trosmos command shell',
    icon: 'fa-terminal',
    category: 'System',
    builtin: true,
    permissions: ['EXECUTE', 'READ', 'WRITE'],
  },
  {
    id: 'notes',
    name: 'Notes',
    version: '4.1.0',
    description: 'Simple text and markdown editor',
    icon: 'fa-note-sticky',
    category: 'Productivity',
    builtin: true,
    permissions: ['READ', 'WRITE'],
  },
  {
    id: 'calculator',
    name: 'Calculator',
    version: '4.1.0',
    description: 'Scientific calculator',
    icon: 'fa-calculator',
    category: 'Utilities',
    builtin: true,
    permissions: ['EXECUTE'],
  },
  {
    id: 'clock',
    name: 'Clock',
    version: '4.1.0',
    description: 'World clock and timers',
    icon: 'fa-clock',
    category: 'Utilities',
    builtin: true,
    permissions: ['EXECUTE'],
  },
  {
    id: 'clipboard',
    name: 'Clipboard',
    version: '4.1.0',
    description: 'Clipboard history',
    icon: 'fa-clipboard',
    category: 'Utilities',
    builtin: true,
    permissions: ['READ'],
  },
  {
    id: 'task-manager',
    name: 'Task Manager',
    version: '4.1.0',
    description: 'Running processes and background jobs',
    icon: 'fa-list-check',
    category: 'System',
    builtin: true,
    permissions: ['SYSTEM'],
  },
  {
    id: 'app-store',
    name: 'App Store',
    version: '4.1.0',
    description: 'Browse and manage applications',
    icon: 'fa-store',
    category: 'System',
    builtin: true,
    permissions: ['SYSTEM'],
  },
  {
    id: 'help',
    name: 'Help',
    version: '4.1.0',
    description: 'Documentation and tips',
    icon: 'fa-circle-question',
    category: 'System',
    builtin: true,
    permissions: ['EXECUTE'],
  },
];

router.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    res.json({ apps: CATALOG });
  })
);

router.get(
  '/installed',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const rows = db
      .prepare('SELECT app_id, version, enabled, settings, installed_at FROM apps_installed WHERE user_id = ?')
      .all(req.user.id);
    // Built-in apps are always available
    const installed = CATALOG.map((app) => {
      const row = rows.find((r) => r.app_id === app.id);
      return {
        ...app,
        enabled: row ? Boolean(row.enabled) : true,
        installed: true,
        userSettings: row?.settings ? JSON.parse(row.settings) : null,
        installedAt: row?.installed_at || null,
      };
    });
    res.json({ apps: installed });
  })
);

router.post(
  '/:appId/enable',
  asyncHandler(async (req, res) => {
    const appId = req.params.appId;
    const app = CATALOG.find((a) => a.id === appId);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const db = getDb();
    db.prepare(
      `INSERT INTO apps_installed (id, user_id, app_id, version, enabled)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(user_id, app_id) DO UPDATE SET enabled = 1`
    ).run(uid('app'), req.user.id, appId, app.version);
    res.json({ ok: true, appId, enabled: true });
  })
);

router.post(
  '/:appId/disable',
  asyncHandler(async (req, res) => {
    const appId = req.params.appId;
    if (['files', 'settings', 'ai'].includes(appId)) {
      return res.status(403).json({ error: 'Cannot disable core system apps' });
    }
    const db = getDb();
    db.prepare(
      `INSERT INTO apps_installed (id, user_id, app_id, version, enabled)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(user_id, app_id) DO UPDATE SET enabled = 0`
    ).run(uid('app'), req.user.id, appId, '4.1.0');
    res.json({ ok: true, appId, enabled: false });
  })
);

export default router;
