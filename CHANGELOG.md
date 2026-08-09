# Changelog

## 4.1.0 — Full-stack platform

### Backend
- Node.js + Express system server
- SQLite schema: users, sessions, files, settings, notifications, apps, tasks, audit_logs, ai_conversations, devices
- JWT authentication with bcrypt password hashing and session table
- Per-user virtual filesystem with quotas, trash, restore, search
- REST API under /api/v1 (auth, files, settings, notifications, search, apps, tasks, users, ai, system)
- WebSocket channel (/ws) for live notifications and events
- AI proxy with server-side tool execution for file operations
- Rate limiting, helmet, CORS, centralized error handling
- Health and diagnostics endpoints
- Graceful shutdown

### Frontend
- TrosmosAPI client for backend integration
- Hybrid login: real register/login or offline local mode
- AI module prefers /api/v1/ai/chat when authenticated
- Vite proxy for /api and /ws in development
- Preserved entire desktop shell, apps, window manager, and visual identity

### Ops
- .env.example, concurrent dev scripts, production start
- Zero external database required for development

## 4.0.0
- Premium client-side OS with window manager, VFS, AI copilot, apps, PWA
