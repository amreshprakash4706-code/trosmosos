# Changelog

## 4.2.1 — Production hardening (continued)

### Database
- Migrated from `better-sqlite3` to Node.js built-in `node:sqlite` (DatabaseSync)
- No native addon compilation required; works on any Node 22+ platform
- Additive schema migrations for lockout fields and trash original_path

### Security
- Account lockout after repeated failed login attempts (configurable window)
- Stronger password policy (letter + number required)
- Session token hash index for faster validation
- Periodic cleanup of expired sessions and old audit logs

### Virtual filesystem
- Trash moves nodes to unique `/Trash/{id}_{name}` paths and stores `original_path`
- Live path is freed on trash so the same name can be recreated immediately
- Restore accepts original path or trash path and refuses collisions
- Permanent delete resolves by live path, trash path, or original_path
- Existence checks only consider non-trashed nodes for live-path collisions

### Deployment
- Production Dockerfile (node:22-bookworm-slim)
- Healthcheck against `/api/v1/system/health`

## 4.2.0 — Production hardening

### Security
- Production startup fails closed if JWT_SECRET is missing, default, or too short
- WebSocket authentication prefers HttpOnly cookie over query-string JWT
- Helmet Content-Security-Policy and HSTS enabled in production
- Session list + revoke endpoints (`GET/DELETE /api/v1/auth/sessions`)
- Logout clears cookie with matching security attributes

### Virtual filesystem
- All multi-record mutations are transactional
- Move/rename correctly maintain parent_id consistency for the subtree
- Added recursive `copyNode` and `/api/v1/files/copy`
- Added trash listing endpoint
- Quota checks remain atomic with mutations
- Restore refuses to collide with an existing live path

### Backend / Frontend client
- Version 4.2.0
- WebSocket connection no longer requires a query token when cookie session is present
- Added `copy` and session revoke helpers on `TrosmosAPI`
- Preserved full desktop shell, apps, and visual identity

## 4.1.0 — Full-stack platform
- Node.js + Express + SQLite multi-user backend
- JWT auth, VFS, AI proxy, WebSocket, rate limits, helmet

## 4.0.0
- Premium client-side OS
