/** Canonical Trosmos keyboard shortcut registry. Browser-reserved combos are avoided. */

export type ShortcutDef = {
  id: string;
  action: string;
  label: string;
  keys: string;
  group: "Window" | "Desktop" | "Apps" | "Files" | "Editor" | "System";
};

export const SHORTCUTS: ShortcutDef[] = [
  { id: "palette", action: "palette", label: "Command palette", keys: "Mod+K", group: "System" },
  { id: "ai", action: "ai", label: "Trosmos AI", keys: "Mod+/", group: "Apps" },
  { id: "search", action: "search", label: "Search", keys: "Mod+Shift+F", group: "System" },
  { id: "launcher", action: "launcher", label: "Launcher", keys: "Mod+Space", group: "Desktop" },
  { id: "overview", action: "overview", label: "Mission Control", keys: "Mod+Up", group: "Window" },
  { id: "cycle", action: "cycle", label: "Cycle windows", keys: "Alt+Tab", group: "Window" },
  { id: "close", action: "close", label: "Close focused window", keys: "Mod+W", group: "Window" },
  { id: "minimize", action: "minimize", label: "Minimize focused window", keys: "Mod+M", group: "Window" },
  { id: "maximize", action: "maximize", label: "Maximize / restore", keys: "Mod+Shift+M", group: "Window" },
  { id: "snap-left", action: "snap-left", label: "Snap left", keys: "Mod+Alt+Left", group: "Window" },
  { id: "snap-right", action: "snap-right", label: "Snap right", keys: "Mod+Alt+Right", group: "Window" },
  { id: "snap-max", action: "snap-max", label: "Snap maximize", keys: "Mod+Alt+Up", group: "Window" },
  { id: "tile-quad", action: "tile-quad", label: "Quarter tile", keys: "Mod+Alt+Q", group: "Window" },
  { id: "escape", action: "escape", label: "Close overlay / overview", keys: "Escape", group: "System" },
  { id: "lock", action: "lock", label: "Lock screen", keys: "Mod+L", group: "System" },
  { id: "files", action: "files", label: "Open Files", keys: "Mod+E", group: "Apps" },
  { id: "terminal", action: "terminal", label: "Open Terminal", keys: "Mod+`", group: "Apps" },
  { id: "notes", action: "notes", label: "Open Notes", keys: "Mod+Shift+N", group: "Apps" },
  { id: "tasks", action: "tasks", label: "Open Tasks", keys: "Mod+Shift+T", group: "Apps" },
  { id: "settings", action: "settings", label: "Open Settings", keys: "Mod+,", group: "Apps" },
  { id: "workspace-1", action: "workspace-1", label: "Workspace 1", keys: "Mod+Alt+1", group: "Desktop" },
  { id: "workspace-2", action: "workspace-2", label: "Workspace 2", keys: "Mod+Alt+2", group: "Desktop" },
  { id: "workspace-3", action: "workspace-3", label: "Workspace 3", keys: "Mod+Alt+3", group: "Desktop" },
  { id: "dock-1", action: "dock-1", label: "Dock app 1", keys: "Mod+1", group: "Desktop" },
  { id: "dock-2", action: "dock-2", label: "Dock app 2", keys: "Mod+2", group: "Desktop" },
  { id: "dock-3", action: "dock-3", label: "Dock app 3", keys: "Mod+3", group: "Desktop" },
  { id: "dock-4", action: "dock-4", label: "Dock app 4", keys: "Mod+4", group: "Desktop" },
  { id: "dock-5", action: "dock-5", label: "Dock app 5", keys: "Mod+5", group: "Desktop" },
  { id: "dock-6", action: "dock-6", label: "Dock app 6", keys: "Mod+6", group: "Desktop" },
  { id: "dock-7", action: "dock-7", label: "Dock app 7", keys: "Mod+7", group: "Desktop" },
  { id: "select-all", action: "select-all", label: "Select all (desktop / files)", keys: "Mod+A", group: "Files" },
  { id: "find", action: "find", label: "Find in Editor", keys: "Mod+F", group: "Editor" },
  { id: "save", action: "save", label: "Save in Editor", keys: "Mod+S", group: "Editor" },
];

export function shortcutById(id: string): ShortcutDef | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}

export function formatShortcut(keys: string, isMac = false): string {
  return keys
    .replace(/Mod/g, isMac ? "⌘" : "Ctrl")
    .replace(/Shift/g, isMac ? "⇧" : "Shift")
    .replace(/Alt/g, isMac ? "⌥" : "Alt")
    .replace(/Left/g, "←")
    .replace(/Right/g, "→")
    .replace(/Up/g, "↑")
    .replace(/\+/g, isMac ? "" : "+");
}

export type Chord = {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
};

export function parseChord(keys: string): Chord {
  const parts = keys.split("+");
  const key = (parts[parts.length - 1] || "").toLowerCase();
  return {
    mod: parts.includes("Mod"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
    key,
  };
}

export function eventMatches(e: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; key: string }, chord: Chord): boolean {
  const mod = e.metaKey || e.ctrlKey;
  if (chord.mod !== mod) return false;
  if (chord.alt !== e.altKey) return false;
  if (chord.shift !== e.shiftKey) return false;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (chord.key === "space") return k === " " || k === "Spacebar" || e.key === " ";
  if (chord.key === "up") return e.key === "ArrowUp";
  if (chord.key === "left") return e.key === "ArrowLeft";
  if (chord.key === "right") return e.key === "ArrowRight";
  if (chord.key === "tab") return e.key === "Tab";
  if (chord.key === "escape") return e.key === "Escape";
  if (chord.key === ",") return e.key === ",";
  if (chord.key === "`") return e.key === "`";
  if (chord.key === "/") return e.key === "/";
  return k === chord.key || e.key === chord.key;
}

export function matchShortcut(e: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; key: string }): ShortcutDef | null {
  for (const s of SHORTCUTS) {
    if (s.keys === "Escape") {
      if (e.key === "Escape") return s;
      continue;
    }
    if (eventMatches(e, parseChord(s.keys))) return s;
  }
  return null;
}

export function groupedShortcuts(): Record<string, ShortcutDef[]> {
  const out: Record<string, ShortcutDef[]> = {};
  for (const s of SHORTCUTS) {
    (out[s.group] ||= []).push(s);
  }
  return out;
}
