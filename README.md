# Trosmos OS 4.0

Premium AI-native browser operating system — modular kernel, app lifecycle, workspaces, controlled APIs.

## Quick start

```bash
npm install
npm run dev
```

Open the Vite URL. For full AI tool-calling, deploy to Netlify and set `GEMINI_API_KEY`.

## Architecture (v4.0)

```
Trosmos Kernel
├── Event Bus
├── App Registry + Lifecycle
├── Command Registry
├── Search Index
├── Permissions
├── Window Manager hooks
├── Workspaces
├── Clipboard Service
├── Trash / Recovery
├── Undo / Redo
├── Theme Engine
├── Session (lock)
├── Network Service
├── System Monitor
├── Audit Log
├── Migration Engine
├── Crash Recovery
├── Deep Links
└── i18n foundation

Controlled APIs on window.Trosmos:
  apps, commands, search, events, clipboard, theme,
  workspaces, trash, undo, audit, session, network, monitor
```

## Features

- Modular OS kernel with isolated app lifecycle (registered → launching → running → suspended → closing → closed / failed)
- Extensible app registry (metadata, capabilities, file associations, deep links)
- Universal command palette + search index (apps, files, notes, commands)
- Multi-workspace desktop (Main, Work, Development, Personal)
- Trash with restore / permanent delete
- Undo/redo infrastructure
- Theme engine (light / dark / system)
- Real system monitor (browser APIs only — no fabricated metrics)
- Clipboard abstraction with internal history
- Permission-gated AI tools
- Virtual filesystem (IndexedDB) + File Manager
- Dual-mode shell: desktop windows + mobile home/dock
- PWA + offline shell
- Deep links (`?app=files`, `?file=/Home/Documents/x.txt`)
- Crash isolation — one broken app does not take down the shell

## Keyboard

| Shortcut | Action |
|----------|--------|
| Ctrl+K | Command palette |
| Ctrl+T | Terminal |
| Ctrl+L | Lock screen |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Ctrl+Alt+1..4 | Switch workspace |
| Esc | Close overlays |

## Security

- `GEMINI_API_KEY` server-side only (Netlify function)
- Path-normalized VFS
- XSS-safe rendering
- Destructive AI actions require confirmation
- Deep links validated — no arbitrary code from URL params
- Calculator uses CSP-safe expression parser (no `eval`)

## Project layout

```
index.html                 Core shell UI + WindowManager / VFS / AI
public/trosmos-kernel-boot.js   Kernel bridge (v4 APIs)
public/trosmos-apps.js          App implementations
public/trosmos-enhance.js        Device mode / mobile / workspaces UI
src/core/                       Modular kernel sources (ES modules)
src/filesystem/                 VFS, storage, trash
src/services/                   AI tools
netlify/functions/              Gemini-backed AI endpoint
```

## Version

**4.0.0** — Major architectural rebuild toward a cohesive browser OS platform.
