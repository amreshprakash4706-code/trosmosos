import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { config } from './config.js';
import { getDb, closeDb } from './db.js';
import { setupWebSocket } from './websocket.js';
import { notFound, errorHandler } from './middleware/error.js';
import { optionalAuth } from './middleware/auth.js';

import authRoutes from './routes/auth.js';
import filesRoutes from './routes/files.js';
import settingsRoutes from './routes/settings.js';
import notificationsRoutes from './routes/notifications.js';
import systemRoutes from './routes/system.js';
import aiRoutes from './routes/ai.js';
import searchRoutes from './routes/search.js';
import appsRoutes from './routes/apps.js';
import tasksRoutes from './routes/tasks.js';
import usersRoutes from './routes/users.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '../..');

// Ensure DB is initialized
getDb();

const app = express();
app.set('sessionCookieName', config.sessionCookieName);
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // Frontend has its own CSP; tighten in production reverse-proxy
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || config.corsOrigins.includes(origin) || config.isDev) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMIT' },
});

app.use('/api', apiLimiter);
app.use(optionalAuth);

// API v1
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/files', filesRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/system', systemRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/apps', appsRoutes);
app.use('/api/v1/tasks', tasksRoutes);
app.use('/api/v1/users', usersRoutes);

// Health shortcut
app.get('/health', (req, res) => {
  res.redirect(302, '/api/v1/system/health');
});

// Serve frontend (prefer dist when built, always fall back to public + root)
if (existsSync(path.join(root, 'dist'))) {
  app.use(express.static(path.join(root, 'dist'), { index: false }));
}
app.use(express.static(path.join(root, 'public'), { index: false }));
app.use(express.static(root, { index: false }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  const indexPath = path.join(root, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
setupWebSocket(server);

function shutdown(signal) {
  console.log(`[trosmos] ${signal} received — shutting down`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(config.port, config.host, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Trosmos OS ${config.version.padEnd(10)} — Full-Stack Web OS          ║
╠══════════════════════════════════════════════════════════╣
║  Server:   http://${config.host}:${config.port}                       ║
║  API:      http://localhost:${config.port}/api/v1                     ║
║  Health:   http://localhost:${config.port}/api/v1/system/health       ║
║  WS:       ws://localhost:${config.port}/ws                           ║
║  AI:       ${config.aiEnabled ? 'configured' : 'not configured (set GEMINI_API_KEY)'}                          ║
║  DB:       ${config.dbPath}  ║
╚══════════════════════════════════════════════════════════╝
`);
});

export default app;
