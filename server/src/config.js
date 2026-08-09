import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '../..');

loadEnv({ path: join(root, '.env') });

const dataDir = process.env.TROSMOS_DATA_DIR || join(root, 'server/data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  isDev: (process.env.NODE_ENV || 'development') !== 'production',

  // Security
  jwtSecret: process.env.JWT_SECRET || 'trosmos-dev-secret-change-me-in-production-32chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  sessionCookieName: 'trosmos_session',
  bcryptRounds: 12,
  maxLoginAttempts: 8,
  loginWindowMs: 15 * 60 * 1000,

  // Database
  dbPath: process.env.DATABASE_PATH || join(dataDir, 'trosmos.db'),
  dataDir,

  // Storage limits (per user)
  maxStorageBytes: parseInt(process.env.MAX_STORAGE_BYTES || String(50 * 1024 * 1024), 10), // 50 MB default
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES || String(5 * 1024 * 1024), 10), // 5 MB
  maxFilesPerUser: parseInt(process.env.MAX_FILES_PER_USER || '2000', 10),

  // AI
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'gemini-2.0-flash',
  aiEnabled: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),

  // Rate limits
  rateLimitWindowMs: 60 * 1000,
  rateLimitMax: 120,
  authRateLimitMax: 20,

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Version
  version: '4.1.0',
  name: 'Trosmos OS',
};

export default config;
