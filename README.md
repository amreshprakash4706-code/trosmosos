# Trosmos OS 5.0 — Full-Stack AI-Native Web Operating System

Trosmos is a real multi-user web operating environment: window manager, virtual filesystem, applications, AI copilot with **capability-aware** tool execution, authentication, WebSockets, and PWA support.

## What is new in 5.0

- **Capability system** — every privileged action (especially AI tools) is gated by explicit `vfs:read` / `vfs:write` / `vfs:delete` / `ai:tool` grants.
- **AI ToolExecutor** — mutating tools require confirmation; all tool calls are audited and rate-limited per user.
- **Versioned migrations** — clean upgrade path from 4.2.1 with `schema_migrations` table.
- **Correlation IDs** on every request and AI invocation.
- **CSRF protection** for cookie-authenticated mutating requests.
- **Hardened VFS** — content hashing, stricter isolation tests.
- **Expanded test suite** — isolation, capability, and AI confirmation tests.

## Requirements

- **Node.js 22+** (built-in `node:sqlite`)
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
docker build -t trosmos-os:5.0 .
docker run --rm -p 3000:3000 \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -v trosmos-data:/app/server/data \
  trosmos-os:5.0
```

## Security (5.0)

- Production refuses to start with a missing/default JWT secret
- HttpOnly session cookies (Secure + SameSite=Lax in production)
- CSRF double-submit for cookie-based mutations
- WebSocket prefers cookie handshake over JWT-in-URL
- Helmet CSP + HSTS in production
- Per-user VFS isolation, path normalization, quotas
- Transactional filesystem mutations
- Capability checks on every AI tool
- Mutating AI tools require explicit confirmation
- Account lockout after repeated failed logins
- Password policy: min 8 chars, letter + number
- Rate limiting (global + AI per-user), bcrypt (12 rounds)
- Correlation IDs + structured audit log
- Periodic expired-session, audit, and pending-invocation cleanup

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Concurrent server + Vite |
| `npm run server` | API + frontend |
| `npm run build` | Vite production build |
| `npm start` | Production server |
| `npm test` | Full test suite (VFS, auth, isolation, AI safety) |
| `npm run db:reset` | Wipe SQLite |

Database auto-creates / migrates at `server/data/trosmos.db`.

## Migration from 4.2.1

1. Backup your existing `trosmos.db`.
2. Deploy 5.0 binaries.
3. Start the server — migrations run automatically and grant default capabilities to existing users.
4. Verify with `npm test` and a health check.

## License

Proprietary / as supplied with the original project.
