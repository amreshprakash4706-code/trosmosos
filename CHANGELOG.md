# Trosmos OS — Changelog

## v4.0.0 — Modular OS Kernel Platform

### Architecture
- **Kernel-like core** with controlled APIs: `Trosmos.apps`, `Trosmos.commands`, `Trosmos.search`, `Trosmos.events`, `Trosmos.clipboard`, `Trosmos.theme`, `Trosmos.workspaces`, `Trosmos.trash`, `Trosmos.undo`, `Trosmos.audit`, `Trosmos.session`, `Trosmos.network`, `Trosmos.monitor`
- **App Registry** with lifecycle states: registered → launching → running → suspended → closing → closed / failed
- Application isolation — one broken app cannot take down the shell
- Extensible registration: metadata, capabilities, file associations, deep links, commands
- **Universal Search Index** (apps, files, notes, commands) with ranked results
- **Command Registry** shared by palette and launcher
- **Event Bus** with system event catalog and recent history
- **Permission system** expanded with capability model
- **Migration engine** (schema v1 → v4)
- **Audit log** for app launches, permissions, filesystem, errors
- **Crash recovery** with isolation and restart support
- **Deep link** validation (`?app=`, `?file=`) — no arbitrary code execution

### Window & Desktop
- Multi-workspace desktop (Main, Work, Development, Personal) with persistence
- Ctrl+Alt+1..4 workspace switching
- Window assignment to workspaces
- System Monitor app (real browser metrics only)

### Filesystem
- **Trash / Recovery**: soft-delete → restore / permanent delete
- VFS delete routes through trash by default
- Undo/redo infrastructure for reversible operations

### Services
- Clipboard abstraction with internal history (honest about browser limits)
- Theme engine: light / dark / system via CSS custom properties
- Network service (online / offline / degraded)
- Session lock with idle timeout
- i18n foundation (English + Hindi string tables)

### UX
- Command palette enriched with unified search
- Self-diagnostic (`Trosmos.diagnose()`)
- Startup path prioritizes critical shell

### Compatibility
- Existing IndexedDB user data preserved via migrations
- Legacy app openers and window manager retained
- Dual-mode desktop/mobile shell from v2.9 preserved

---

## v2.9.0 — True dual-mode OS shell

- Automatic desktop / tablet / mobile detection
- Mobile home screen, status bar, bottom navigation
- Workspaces, Alt+Tab, power menu, quick settings
- Safe-area / PWA standalone support
