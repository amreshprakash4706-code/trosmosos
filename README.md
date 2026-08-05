# Trosmos OS 2.9

Premium AI-native web operating system — complete interactive desktop environment.

## Quick start

```bash
npm install
npm run dev
```

Open the Vite URL. For full AI tool-calling, deploy to Netlify and set `GEMINI_API_KEY`.

## Features

- Dual-mode shell: full desktop windows **and** native-feeling mobile home/dock
- Workspaces, Alt+Tab app switcher, power menu, quick settings
- Safe-area / PWA standalone support

- Desktop with icons, dock, Start menu, lock screen
- Window manager: drag, resize, minimize, maximize (double-click titlebar), focus, snap, persist
- Virtual filesystem (IndexedDB) + File Manager
- Terminal (sandboxed shell: ls, cd, cat, write, mv, cp, apps, processes, system…)
- Calculator (scientific + history), Notes (VFS save), Clock, Clipboard
- Browser, Settings, App Store, Task Manager, Help
- Command palette (Ctrl+K) with unified app search
- Trosmos AI copilot with permission-gated tools
- App Registry — single catalog for launchers
- Persistent notifications
- PWA + offline shell

## Keyboard

| Shortcut | Action |
|----------|--------|
| Ctrl+K | Command palette |
| Ctrl+T | Terminal |
| Ctrl+L | Lock screen |
| Ctrl+S | Save note to Files (in Notes) |
| Esc | Close overlays |

## Security

- `GEMINI_API_KEY` server-side only (Netlify function)
- Path-normalized VFS
- XSS-safe rendering
- Destructive AI actions require confirmation
- Calculator uses a CSP-safe expression parser (no `eval`)

## Architecture

```
index.html          Core OS (WindowManager, VFS, AI, Desktop…)
public/trosmos-apps.js   Apps extension + AppRegistry
src/                Modular services (event-bus, permissions, storage, VFS, AI tools)
netlify/functions/  Gemini-backed AI endpoint
```
