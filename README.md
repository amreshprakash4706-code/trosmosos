# Trosmos OS 4.4 — Full-Stack AI-Native Web Operating System

Trosmos is a real multi-user web operating environment: window manager, virtual filesystem, applications, AI copilot with capability-aware tool execution, authentication, WebSockets, workspaces, notes, background jobs, backup/export, and PWA support.

## What is new in 4.4

- Workspaces with persisted state
- Notes workspace (VFS-backed markdown)
- Favorites and recent items
- Background job engine with real handlers
- File upload/download, empty trash, metadata
- User data export/import
- Short-lived WebSocket tickets
- Broader AI tools, still confirmation + capability gated
- Migration v4 + expanded tests

## Requirements

- Node.js 22+ (built-in `node:sqlite`)
- Optional: `GEMINI_API_KEY` for AI features

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Production:

```bash
export NODE_ENV=production
export JWT_SECRET="$(openssl rand -hex 32)"
npm run build
npm start
```

Health: `GET /api/v1/system/health`  
Ready: `GET /api/v1/system/ready`

## Tests

```bash
npm test
```

## Honest limitations

- The in-browser Terminal is a Trosmos shell, not a host OS shell.
- AI is unavailable unless `GEMINI_API_KEY` is set.
- Binary previews depend on browser support.
- Netlify static hosting cannot run the Node + SQLite API; use Node or Docker for the full stack.
