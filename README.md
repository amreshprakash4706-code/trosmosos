# Trosmos OS 2.7

Premium AI-native web operating system — complete interactive desktop environment.

## Quick start

```bash
npm install
npm run dev
```

Open the Vite URL. For full AI tool-calling, deploy to Netlify and set `GEMINI_API_KEY`.

## Features

- Desktop with icons, dock, Start menu, lock screen
- Window manager: drag, resize, minimize, maximize, focus, persist
- Virtual filesystem (IndexedDB) + File Manager
- Terminal, Calculator, Notes, Clock, Clipboard, Browser, Settings, App Store, Task Manager
- Command palette (Ctrl+K)
- Trosmos AI copilot with permission-gated tools
- PWA + offline shell

## Keyboard

| Shortcut | Action |
|----------|--------|
| Ctrl+K | Command palette |
| Ctrl+T | Terminal |
| Ctrl+L | Lock screen |
| Esc | Close overlays |

## Security

- `GEMINI_API_KEY` server-side only (Netlify function)
- Path-normalized VFS
- XSS-safe rendering
- Destructive AI actions require confirmation
