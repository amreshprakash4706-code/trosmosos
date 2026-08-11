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
import { getDb, closeDb, cleanupExpired } from './db.js';
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

getDb();

const app = express();
app.set('sessionCookieName', config.sessionCookieName);
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: config.isDev ? false : {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'connect-src': ["'self'", 'ws:', 'wss:', 'https://generativelanguage.googleapis.com'],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'object-src': ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: config.isDev ? false : { maxAge: 31536000, includeSubDomains: true },
}));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || config.corsOrigins.includes(origin) || config.isDev) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.use('/api', rateLimit({
  windowMs: config.rateLimitWindowMs, max: config.rateLimitMax,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMIT' },
}));
app.use(optionalAuth);

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

app.get('/health', (req, res) => res.redirect(302, '/api/v1/system/health'));

if (existsSync(path.join(root, 'dist'))) {
  app.use(express.static(path.join(root, 'dist'), { index: false, maxAge: config.isDev ? 0 : '1h' }));
}
app.use(express.static(path.join(root, 'public'), { index: false, maxAge: config.isDev ? 0 : '1h' }));
app.use(express.static(root, { index: false }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  res.sendFile(path.join(root, 'index.html'), (err) => { if (err) next(); });
});

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
setupWebSocket(server);

function shutdown(signal) {
  console.log(`[trosmos] ${signal} received — shutting down`);
  server.close(() => { closeDb(); process.exit(0); });
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
  // Periodic session / audit cleanup
  cleanupExpired();
  setInterval(cleanupExpired, 60 * 60 * 1000).unref();
});

export default app;
