# Trosmos OS 4.3 — Engineering Report

## Summary

4.3 adds real file version history, binary-aware VFS storage, expanded AI tools (capability + confirmation gated), and isolation tests — without discarding the existing Node.js + node:sqlite backend, desktop shell, or security model.

## Advances
1. File versioning (`file_versions` table; snapshot on write; list/restore).
2. Binary storage path (content vs content_blob; base64 hint on read).
3. Expanded ToolExecutor (trash/restore/versions).
4. Migration v3 + versions isolation test.

## Preserved
node:sqlite, per-user VFS isolation, transactional mutations, JWT fail-closed, CSRF, capabilities, desktop/PWA identity.

## Verify
```bash
npm install && npm test
NODE_ENV=production JWT_SECRET=$(openssl rand -hex 32) npm start
```
