# Trosmos OS 4.3 — Full-Stack AI-Native Web Operating System

Trosmos is a real multi-user web operating environment: window manager, virtual filesystem, applications, AI copilot with **capability-aware** tool execution, authentication, WebSockets, and PWA support.

## What is new in 4.3

- **File versioning** — automatic snapshots on write; list and restore previous versions via API and AI tools.
- **Binary-aware VFS** — content_blob path for non-text files; base64 encoding hint on read.
- **Expanded AI tools** — trash/restore, list/restore versions (still capability + confirmation gated).
- Migration v3 + versions isolation tests.

## Requirements

- **Node.js 22+** (built-in `node:sqlite`)
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
npm start
```

Health: `GET /api/v1/system/health`
