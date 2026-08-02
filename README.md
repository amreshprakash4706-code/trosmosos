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
- Real AI agent with controlled tools + permission prompts (modal UI)
- Persistent virtual filesystem (non-destructive IndexedDB migrations, path-safe)
- Window / Process / Desktop managers
- Command palette (Ctrl+K)
- Task Manager
- PWA + offline shell (SW v6)

Preserves the original Trosmos visual identity (glassmorphism, aurora, dock, window chrome).

## Security notes

- `GEMINI_API_KEY` is server-side only (Netlify function)
- AI tool arguments are validated and path-normalized
- Destructive AI actions require explicit user confirmation
- User/AI chat content is sanitized before DOM insertion
