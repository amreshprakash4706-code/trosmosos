import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '../..');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  try {
    const text = readFileSync(filePath, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (e) {
    console.warn('[config] could not read .env:', e.message);
  }
}
loadEnvFile(join(root, '.env'));

const dataDir = process.env.TROSMOS_DATA_DIR || join(root, 'server/data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const isDev = (process.env.NODE_ENV || 'development') !== 'production';
const DEFAULT_DEV_SECRET = 'trosmos-dev-secret-change-me-in-production-32chars';
const jwtSecret = process.env.JWT_SECRET || '';

if (!isDev) {
  if (!jwtSecret || jwtSecret === DEFAULT_DEV_SECRET || jwtSecret.length < 32) {
    console.error(
      '[trosmos] FATAL: JWT_SECRET must be set to a strong random value (≥32 chars) in production. Refusing to start.'
    );
    process.exit(1);
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  isDev,
  jwtSecret: jwtSecret || DEFAULT_DEV_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  sessionCookieName: 'trosmos_session',
  csrfCookieName: 'trosmos_csrf',
  bcryptRounds: 12,
  maxLoginAttempts: 8,
  loginWindowMs: 15 * 60 * 1000,
  sessionIdleMs: parseInt(process.env.SESSION_IDLE_MS || String(7 * 24 * 60 * 60 * 1000), 10),
  dbPath: process.env.DATABASE_PATH || join(dataDir, 'trosmos.db'),
  dataDir,
  maxStorageBytes: parseInt(process.env.MAX_STORAGE_BYTES || String(50 * 1024 * 1024), 10),
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES || String(5 * 1024 * 1024), 10),
  maxFilesPerUser: parseInt(process.env.MAX_FILES_PER_USER || '2000', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'gemini-2.0-flash',
  aiEnabled: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
  rateLimitWindowMs: 60 * 1000,
  rateLimitMax: 120,
  authRateLimitMax: 20,
  aiRateLimitMax: 30,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  version: '4.4.0',
  name: 'Trosmos OS',
  bodyLimit: '2mb',
};

export default config;
