# Changelog

## 5.0.0 — Capability-aware, AI-hardened release

### Security & Architecture
- Introduced explicit capability grants (`vfs:read`, `vfs:write`, `vfs:delete`, `ai:tool`)
- AI tools now execute exclusively through ToolExecutor with capability checks
- Mutating AI tools require user confirmation before execution
- Full audit trail of AI tool invocations (`ai_tool_invocations` table)
- Correlation IDs on every request and audit row
- CSRF protection for cookie-authenticated state-changing requests
- Per-user AI rate limiting
- Versioned database migrations (`schema_migrations`)

### Virtual filesystem
- Content hashing on write/create
- Isolation regression tests
- Retained transactional guarantees and unique trash paths from 4.2.1

### Testing
- New isolation.test.js covering cross-user VFS and AI tool boundaries
- Confirmation-flow tests for mutating tools

### Compatibility
- Automatic migration from 4.2.1 databases
- Default capabilities granted to existing users on upgrade
- API surface remains compatible for the majority of clients

## 4.2.1 — Production hardening (previous)
- node:sqlite, unique trash paths, account lockout, Docker, tests
