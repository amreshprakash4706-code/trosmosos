# Trosmos OS — Changelog

## v2.7 — Complete Desktop Environment

### New Applications
- Terminal — sandboxed virtual shell (ls, cd, cat, mkdir, rm, search, open, neofetch…)
- Calculator — arithmetic with keyboard support
- Notes — persistent multi-note editor
- Clock — live clock with timezone
- Clipboard Manager — history via Clipboard API
- Help & About

### Window Manager
- Resizable windows (8-direction handles)
- Existing drag / min / max / focus / snap retained

### System
- Lock screen with live clock (Ctrl+L)
- Expanded dock, Start menu, command palette
- Ctrl+T Terminal
- Trash folder + sample Project Orion in VFS
- Desktop icons for Terminal, Notes, Calculator

### Architecture
- Apps extension: `public/trosmos-apps.js`
- Core OS remains in index.html; modular src/ retained for VFS/permissions/AI tools

---

## v2.6 — Production Hardening
See prior notes for StorageManager, PermissionManager, AI tools, SW v6.
