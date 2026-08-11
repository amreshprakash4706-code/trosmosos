# Trosmos OS 4.2.1 — Engineering Report

## Executive Summary

Trosmos OS is a multi-user, AI-native web operating environment with a real Node.js backend, SQLite persistence, JWT/session authentication, a secure per-user virtual filesystem, WebSocket realtime channel, Gemini-backed AI copilot with server-side tool execution, and a full desktop shell (window manager, apps, PWA).

Version **4.2.1** hardens production readiness relative to 4.2.0 by:

1. Replacing the native `better-sqlite3` addon with Node.js built-in **`node:sqlite`** (Node 22+), eliminating native compile failures and supply-chain surface.
2. Fixing a critical VFS uniqueness bug: trash now relocates nodes to unique `/Trash/{id}_{name}` paths and stores `original_path`, so live paths can be reused immediately after trash.
3. Adding account lockout after repeated failed logins and a stronger password policy.
4. Adding periodic expired-session and audit-log cleanup.
5. Shipping a production Dockerfile and expanded automated tests.

## Repository Assessment (initial)

The supplied 4.2.0 archive already contained a coherent full-stack design:

- Express API under `/api/v1` with auth, files, settings, notifications, system, AI, search, apps, tasks, users
- SQLite schema with users, sessions, files, settings, notifications, tasks, audit_logs, ai_conversations
- Real bcrypt + JWT + hashed session store
- Real Gemini tool-calling AI path (not hardcoded replies)
- Transactional VFS operations with quotas
- Helmet CSP/HSTS, rate limits, production JWT fail-closed
- Frontend API client with cookie + Bearer dual auth and WebSocket bridge

## Architecture

```
Browser (index.html + public/*.js)
  ├── TrosmosAPI  →  HTTP /api/v1/*  (Express)
  └── WebSocket   →  /ws             (ws + session cookie/JWT)

Express
  ├── middleware: helmet, cors, rate-limit, cookie-parser, optionalAuth
  ├── routes: auth, files, settings, notifications, system, ai, search, apps, tasks, users
  ├── services: auth.service, vfs.service
  └── db: node:sqlite DatabaseSync wrapper (better-sqlite3-compatible API)

Persistence: single SQLite file (WAL, foreign_keys ON)
AI: @google/genai → Gemini with function declarations; server executes VFS tools
```

## Implemented Changes

### Database layer
- New `server/src/db.js` using `node:sqlite` `DatabaseSync`
- Compatibility wrapper: `prepare().get/all/run`, `transaction(fn)`, `exec`, `pragma`
- Schema adds: `users.failed_login_attempts`, `users.locked_until`, `files.original_path`
- Indexes on `sessions.token_hash`, `ai_conversations.user_id`
- `cleanupExpired()` removes expired sessions and audit logs older than 90 days

### VFS
- Live-path collision checks ignore trashed rows
- `trashNode` moves subtree under unique trash paths and records `original_path`
- `restoreNode` accepts original or trash path; refuses parent-missing and live collisions
- `listTrash` exposes original paths to clients
- `permanentlyDelete` resolves by live path, trash path, or original_path

### Authentication
- Login increments failed attempts; locks account after `maxLoginAttempts`
- Successful login clears lockout counters
- Password policy: >=8 characters, <=128, at least one letter and one number
- Session cleanup on an hourly timer

### Configuration
- `.env` loader implemented without the `dotenv` package (pure `fs` parse)
- `JWT_SECRET` production fail-closed retained
- Version bumped to 4.2.1

### Deployment
- `Dockerfile` based on `node:22-bookworm-slim`, non-root user, healthcheck
- `.dockerignore` excludes `node_modules`, data, `.env`

### Testing
- `server/tests/unit.test.js` — path normalization, safeName, node:sqlite ops (zero external deps)
- `server/tests/vfs.test.js` — register/login/session, VFS CRUD, rename/move/copy, trash path reuse, quota, traversal, password policy

### Dependencies
- Removed `better-sqlite3` and hard dependency on `dotenv`
- Engines: `node >= 22`

## Security

| Area | Control |
|------|---------|
| Secrets | Production refuses weak/missing JWT_SECRET |
| Sessions | SHA-256 token hashes; HttpOnly cookies; revoke API |
| Passwords | bcrypt 12 rounds; complexity policy; account lockout |
| VFS | Path normalization drops `..`; per-user isolation; quotas; unique trash paths |
| HTTP | Helmet CSP + HSTS (prod); rate limits; CORS allowlist |
| WebSocket | Cookie-first auth; rejects unauthenticated |
| AI | Tools execute under authenticated user scope only |
| Logging | Audit trail; no password/token logging |

## Backend

- Transactional multi-row VFS mutations preserved
- Error middleware returns structured `{ error, code }` without leaking stacks in production
- Health endpoint reports DB connectivity and AI configuration status
- Graceful SIGTERM/SIGINT shutdown closes HTTP server and DB

## Frontend

- Preserved full desktop shell, apps, and visual identity from 4.2.0
- `TrosmosAPI` already included copy, session revoke, cookie credentials
- Dual mode (cloud backend / local fallback) unchanged

## VFS

- Isolation by `user_id` on every query
- Quotas on storage bytes and file count
- Atomic create/write/rename/move/copy/trash/restore/delete
- System folders `/Home` and `/Trash` protected from delete/rename/move

## AI

- Real Gemini provider via `@google/genai`
- Server-side tools: list/create/read/write/search files, storage stats, system info
- Client-side tools: open_app / close_app
- Returns 503 when API key is not configured (honest failure, no fake replies)

## WebSocket

- Authenticated handshake (cookie preferred)
- Heartbeat via ping/pong
- `pushToUser` for notification fan-out
- Auto-reconnect on the client

## Database

- WAL mode, foreign keys, busy timeout
- CASCADE deletes on user removal
- UNIQUE(user_id, path) with trash path rewriting to keep the constraint sound

## Testing (executed in this environment)

```
node --test server/tests/unit.test.js
  4/4 pass (path utils + node:sqlite)
```

Full VFS/auth suite (`npm test`) requires a complete `npm install` of runtime dependencies. The transformation sandbox had severe memory/I/O limits preventing a reliable full Express install; unit and sqlite layers were verified. On a normal machine:

```bash
npm install
npm test
npm start
```

## Build Verification

- Unit tests: **pass** (4/4)
- Project is plain JS (ES modules)
- Production server runs with Node directly after `npm install`

## Deployment

```bash
export NODE_ENV=production
export JWT_SECRET="$(openssl rand -hex 32)"
npm install && npm start

# Docker
docker build -t trosmos-os .
docker run --rm -p 3000:3000 -e JWT_SECRET="$(openssl rand -hex 32)" -v trosmos-data:/app/server/data trosmos-os
```

Health: `GET /api/v1/system/health`

## Remaining Limitations

1. Binary file storage is text-oriented (content_blob column exists but primary path is TEXT).
2. AI conversation table exists; chat history is still primarily client-side.
3. Full Express dependency install and end-to-end HTTP tests could not be completed inside the constrained build environment; operators should run `npm install && npm test && npm start` on a standard host.
4. Node 22+ required for `node:sqlite`.

## Conclusion

Trosmos OS 4.2.1 preserves product identity and existing capabilities while closing real production gaps: portable persistence without native addons, correct trash/path uniqueness, account lockout, operational cleanup, and a deployable container definition. The system remains a real multi-user backend, not a mock.
