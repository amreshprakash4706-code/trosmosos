import { randomBytes } from 'crypto';

export function correlationId(req, res, next) {
  const incoming = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  const id = (typeof incoming === 'string' && incoming.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(incoming))
    ? incoming
    : randomBytes(12).toString('hex');
  req.correlationId = id;
  res.setHeader('X-Correlation-Id', id);
  next();
}
