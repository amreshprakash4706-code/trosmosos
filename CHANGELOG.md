# Changelog

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
