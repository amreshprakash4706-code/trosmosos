# Trosmos OS 4.1 — Full-Stack Web Operating Environment

Premium AI-native web operating system with a real Node.js backend, multi-user authentication, secure virtual filesystem, WebSockets, and the existing polished desktop/mobile shell.

This is not a demo shell. The browser is the desktop environment; Node.js is the system backend.

## Quick start

```bash
npm install
cp .env.example .env
# Optional: set JWT_SECRET and GEMINI_API_KEY in .env

npm run dev
# API :3000 + Vite :5173 (proxied). Open http://localhost:5173
```

Production-style:

```bash
npm run build
npm start
# http://localhost:3000
```

## Architecture

- Desktop Environment, Window Manager, App System
- Virtual Filesystem (per-user SQLite + offline IndexedDB)
- User System + JWT Auth + bcrypt
- Settings, Notifications, Tasks, Search
- AI (Gemini tools, server-side where safe)
- WebSocket real-time channel
- /api/v1 REST surface + health/diagnostics

## Stack

Frontend: existing Trosmos UI (Vite + Tailwind)
Backend: Node.js + Express + better-sqlite3 + ws
Auth: JWT sessions, httpOnly cookies
AI: optional Gemini via GEMINI_API_KEY

## Auth modes

1. Create account / Sign in — cloud-synced files, settings, notifications
2. Continue offline — full local IndexedDB workspace

## API base: /api/v1

auth, files, settings, notifications, search, apps, tasks, users, ai, system

WebSocket: /ws?token=<jwt>

## Security

Password hashing, rate limits, helmet, path sanitization, per-user VFS isolation, no host shell for users, audit logs, secrets via env only.

## Scripts

- npm run dev — concurrent server + Vite
- npm run server — API only
- npm run build / npm start — production
- npm run db:reset — wipe SQLite

Database auto-creates at server/data/trosmos.db

See .env.example for configuration.
