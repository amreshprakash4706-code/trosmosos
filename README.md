# Trosmos OS

Premium AI-native web operating system.

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown by Vite. For full AI (Gemini tools), deploy to Netlify and set `GEMINI_API_KEY`.

## Production build

```bash
npm run build
npm run start   # serves dist/
```

## Architecture highlights

- Modular core under `src/` (EventBus, Storage, VFS, AI tools, Permissions)
- Real AI agent with controlled tools + permission prompts
- Persistent virtual filesystem (non-destructive IndexedDB migrations)
- Window / Process / Desktop managers
- Command palette (Ctrl+K)
- Task Manager
- PWA + offline shell

Preserves the original Trosmos visual identity (glassmorphism, aurora, dock, window chrome).
