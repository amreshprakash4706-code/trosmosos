# Trosmos OS 4.4 — Engineering Report

4.4 keeps Node.js + node:sqlite + Vite and adds real workspaces, notes, activity, a job engine, backup/export, stronger WebSocket auth, and broader tests. No fabricated metrics or placeholder APIs.

Verify:

```bash
npm install && npm test
npm run build
NODE_ENV=production JWT_SECRET=$(openssl rand -hex 32) npm start
```

Known limitations: no host-OS shell in the browser; AI needs a Gemini key; SQLite is single-node; Netlify cannot host the full API.
