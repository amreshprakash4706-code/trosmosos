# Changelog

## 4.3.0 — Engineering upgrade (file versions, binary storage path, expanded AI tools)

### VFS
- **File versioning**: every write snapshots the previous content into `file_versions`. Users (and AI with capability) can list and restore prior versions.
- **Binary-aware storage**: non-text files prefer `content_blob`; read path returns base64 + encoding hint for binary MIME types.
- New APIs: `GET /api/v1/files/versions?path=…`, `POST /api/v1/files/restore-version`.

### AI / Capabilities
- Expanded ToolExecutor: `list_trash`, `trash_file`, `restore_file`, `list_file_versions`, `restore_file_version` (mutating tools still require confirmation).

### Database
- Migration v3: `file_versions` table + supporting indexes.

### Tests
- New `server/tests/versions.test.js` covering write→snapshot→restore and cross-user isolation.

### Frontend / identity
- Version strings, PWA manifest, and service worker bumped to 4.3.

## 4.2.x — Production hardening / capability system
- Capability grants, AI confirmation, versioned migrations, correlation IDs, CSRF, isolation tests, node:sqlite, Docker.
