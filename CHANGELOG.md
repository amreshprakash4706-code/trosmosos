# Trosmos OS — Changelog

## v2.9.0 — True dual-mode OS shell

### Device modes
- Automatic **desktop / tablet / mobile** detection (viewport + pointer + hover)
- Mobile home screen with app grid, widgets, greeting
- Mobile status bar (time, network, battery when available)
- Mobile bottom navigation (Home, Search, AI, Recents, Power)
- Safe-area insets (`viewport-fit=cover`, `env(safe-area-inset-*)`, `100dvh`)

### Multitasking
- **Alt+Tab** application switcher (desktop) / Recents (mobile)
- **Ctrl/Cmd+W** closes focused window
- **Ctrl+1/2/3** virtual workspaces (desktop)
- Workspace bar with persistent window assignment

### System
- Power menu: Lock, Sleep, Restart, Shut down
- Quick Settings panel (mobile status bar)
- Idle auto-lock (15 min)
- Offline-aware status + SW cache v9 (apps + enhance + CSS)

### Applications
- **Clock 2.9** — Clock / Stopwatch / Timer tabs
- **Terminal** — date, whoami, uname, find, history, echo, reboot, shutdown
- AppRegistry version bump to 2.9

### Identity
- Preserves Trosmos glassmorphism, aurora, branding, AI-native core

## v2.8.0 — Full System Evolution

### Architecture
- Unified **App Registry** (`window.AppRegistry`) — single source of truth for desktop, Start menu, command palette, Terminal `apps`, and launchers
- ProcessManager: `list()`, `killPid()`, richer process metadata
- NotificationManager: persistent history via IndexedDB, read/unread, dismiss, no fake seed data
- WindowManager: double-click title bar to maximize/restore

### Applications
- **Terminal 2.8** — `write`, `mv`, `cp`, `apps`, `processes`/`ps`, `settings`, `system`/`version`, expanded help
- **Calculator** — scientific mode (√, x², sin/cos/tan, log/ln, π, ^), history panel, copy result, CSP-safe parser
- **Notes** — Save to Files (`/Home/Notes`), Ctrl+S, VFS integration
- **Help** — updated for 2.8 shortcuts and features

### System
- Command palette expanded: Terminal, Calculator, Notes, Clock, Clipboard, Help, Lock, Reduce Motion
- Task Manager auto-refreshes while open; Focus / End process actions
- Settings: reduce-motion preference applied system-wide
- Notifications persist across sessions

### Security & Quality
- Calculator remains free of `eval` / `Function`
- Notification toasts use `textContent` (XSS-safe)
- Existing permission gates for AI tools retained

### v2.7.1 — Calculator fix
- CSP-safe parser, keyboard support

### v2.7 — Complete Desktop Environment
- Terminal, Calculator, Notes, Clock, Clipboard, Help
- Resizable windows, lock screen, expanded dock

### v2.6 — Production Hardening
- StorageManager, PermissionManager, AI tools, SW v6
