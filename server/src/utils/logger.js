/**
 * Structured logger for Trosmos OS.
 * Never logs secrets (tokens, passwords, API keys).
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (/(password|secret|token|authorization|cookie|apikey|api_key|credential)/.test(key)) {
      out[k] = '[redacted]';
    } else if (v && typeof v === 'object') {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function emit(level, msg, extra = {}) {
  const min = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  if ((LEVELS[level] || 20) < (LEVELS[min] || 20)) return;
  const line = { ts: new Date().toISOString(), level, msg, ...redact(extra) };
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const logger = {
  debug: (msg, extra) => emit('debug', msg, extra),
  info: (msg, extra) => emit('info', msg, extra),
  warn: (msg, extra) => emit('warn', msg, extra),
  error: (msg, extra) => emit('error', msg, extra),
};

export default logger;
