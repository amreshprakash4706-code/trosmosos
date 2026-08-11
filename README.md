# Trosmos OS 4.2.1 — Full-Stack AI-Native Web Operating System

Trosmos is a real multi-user web operating environment: window manager, virtual filesystem, applications, AI copilot with tool execution, authentication, WebSockets, and PWA support.

## Requirements

- **Node.js 22+** (uses the built-in `node:sqlite` module — no native SQLite addon)
- Optional: `GEMINI_API_KEY` for AI features

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

Docker:

```bash
docker build -t trosmos-os .
docker run --rm -p 3000:3000 -e JWT_SECRET="$(openssl rand -hex 32)" -v trosmos-data:/app/server/data trosmos-os
```

## Security (4.2.1)

- Production refuses to start with a missing/default JWT secret
- HttpOnly session cookies (Secure + SameSite=Lax in production)
- WebSocket prefers cookie handshake over JWT-in-URL
- Helmet CSP + HSTS in production
- Per-user VFS isolation, path normalization, quotas
- Transactional filesystem mutations (rename/move/copy/trash/delete)
- Trash uses unique paths so original paths can be reused safely
- Account lockout after repeated failed logins
- Password policy: min 8 chars, letter + number
- Rate limiting, bcrypt (12 rounds), session revocation API
- Periodic expired-session and audit-log cleanup
- Built-in `node:sqlite` (no native compile surface)

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Concurrent server + Vite |
| `npm run server` | API + frontend |
| `npm run build` | Vite production build |
| `npm start` | Production server |
| `npm test` | VFS + auth integrity tests |
| `npm run db:reset` | Wipe SQLite |

Database auto-creates at `server/data/trosmos.db`. See `.env.example`.
