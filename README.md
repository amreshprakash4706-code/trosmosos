# Trosmos OS 4.2 — Full-Stack AI-Native Web Operating System

Trosmos is a real multi-user web operating environment: window manager, virtual filesystem, applications, AI copilot with tool execution, authentication, WebSockets, and PWA support.

## Quick start

```bash
cp .env.example .env
# Set JWT_SECRET (required in production) and optional GEMINI_API_KEY
npm install
npm run dev          # concurrent API + Vite
# or
npm run server       # API + static frontend on :3000
```

Production:

```bash
export NODE_ENV=production
export JWT_SECRET="$(openssl rand -hex 32)"
npm start
```

## Security (4.2)

- Production refuses to start with a missing/default JWT secret
- HttpOnly session cookies (Secure + SameSite=Lax in production)
- WebSocket prefers cookie handshake over JWT-in-URL
- Helmet CSP + HSTS in production
- Per-user VFS isolation, path normalization, quotas
- Transactional filesystem mutations (rename/move/copy/trash/delete)
- Rate limiting, bcrypt, session revocation API

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Concurrent server + Vite |
| `npm run server` | API + frontend |
| `npm run build` | Vite production build |
| `npm start` | Production server |
| `npm test` | VFS integrity tests |
| `npm run db:reset` | Wipe SQLite |

Database auto-creates at `server/data/trosmos.db`. See `.env.example`.
