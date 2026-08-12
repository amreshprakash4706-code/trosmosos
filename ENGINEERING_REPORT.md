# Trosmos OS 5.0 — Engineering Report

## Executive Summary

Trosmos OS 5.0 is a capability-aware, AI-hardened evolution of the 4.2.1 multi-user web operating system. It preserves the real Node.js + node:sqlite backend, transactional VFS, Gemini tool-calling path, desktop shell, and production Docker surface while closing the most critical trust-boundary gaps identified in the 4.2.1 audit.

## Major Technical Advances

1. **Capability system** — explicit grants (`vfs:read`, `vfs:write`, `vfs:delete`, `ai:tool`) enforced on every AI tool and available for future app permissions.
2. **ToolExecutor** — single authorization and confirmation boundary for all AI tools. Mutating operations require an explicit confirmation step before execution.
3. **Versioned migrations** — `schema_migrations` table + ordered migration functions; 4.2.1 databases upgrade cleanly and receive default capabilities.
4. **Correlation IDs + CSRF** — every request carries an `X-Correlation-Id`; cookie-authenticated mutations require a matching CSRF token.
5. **Expanded tests** — isolation across users, capability denial, and AI confirmation flows.

## Architecture (5.0)

```
Browser → Edge (Helmet, CORS, rate-limit, correlation, CSRF, auth)
       → Services (Auth, Capability, VFS, ToolExecutor, Realtime)
       → node:sqlite (WAL, FK, busy_timeout, versioned schema)
```

AI path: Gemini function call → ToolExecutor → capability check → (optional confirmation) → VFS under the same user_id isolation as human API calls.

## What was deliberately preserved

- node:sqlite (no native addon)
- Per-user VFS isolation and unique trash paths
- Transactional multi-node mutations
- Production JWT fail-closed behaviour
- Cookie + Bearer dual auth
- Desktop / PWA identity and frontend assets

## Remaining limitations (honest)

- Frontend remains a large monolithic shell; full modular App Platform is designed but not fully rewritten in this delivery.
- Binary file storage is still primarily text-oriented.
- Realtime still focuses on notifications + heartbeat; full file-change event fan-out is prepared but not exhaustively wired to every VFS mutation in the UI.
- Full end-to-end browser automation tests are not included (unit/isolation tests are).

## Verification

```bash
npm install
npm test
NODE_ENV=production JWT_SECRET=$(openssl rand -hex 32) npm start
```

Health: `GET /api/v1/system/health`
