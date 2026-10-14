import { create } from "zustand";
import { APP_BY_ID, DEFAULT_DOCK, type AppDef } from "@/lib/trosmos/catalog";
import { DEFAULT_SETTINGS, type OsSettings } from "@/lib/trosmos/core";

export type OsWindow = {
  id: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  snapped?: string | null;
  groupId?: string | null;
  prev?: { x: number; y: number; w: number; h: number };
  payload?: { path?: string; noteId?: string; taskId?: string; eventId?: string };
};

export type SnapPreview = { x: number; y: number; w: number; h: number; kind: string } | null;

export type DeskIcon = {
  id: string;
  appId?: string;
  x: number;
  y: number;
  path?: string;
  kind?: "app" | "file";
  label?: string;
};

type OsState = {
  settings: OsSettings;
  windows: OsWindow[];
  zTop: number;
  focusedId: string | null;
  startOpen: boolean;
  paletteOpen: boolean;
  notifOpen: boolean;
  switcherOpen: boolean;
  snap: SnapPreview;
  desktopIcons: DeskIcon[];
  selection: string[];
  rubber: { x: number; y: number; w: number; h: number } | null;
  contextMenu: {
    x: number;
    y: number;
    items: Array<{ label: string; action: string; danger?: boolean }>;
    onAction?: (action: string) => void;
  } | null;
  cwd: string;
  online: boolean;
  workspaceId: string | null;
  dockApps: string[];
  mobileApp: string | null;
  wallpaperOverride: string | null;
  locked: boolean;
  missionOpen: boolean;
  setSettings: (s: Partial<OsSettings>) => void;
  openApp: (appId: string, payload?: OsWindow["payload"]) => string | null;
  focus: (id: string) => void;
  close: (id: string) => void;
  minimize: (id: string) => void;
  toggleMax: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, x: number, y: number, w: number, h: number) => void;
  restoreWindow: (id: string) => void;
  setSnap: (s: SnapPreview) => void;
  applySnap: (id: string, snap: NonNullable<SnapPreview>) => void;
  restoreFromSnap: (id: string) => void;
  cascade: () => void;
  tile: (mode: "left" | "right" | "quad" | "tl" | "tr" | "bl" | "br" | "max") => void;
  cycle: () => void;
  closeFocused: () => void;
  groupWindows: (ids: string[]) => void;
  ungroup: (id: string) => void;
  setStart: (v: boolean) => void;
  setPalette: (v: boolean) => void;
  setNotif: (v: boolean) => void;
  setSwitcher: (v: boolean) => void;
  setContext: (m: OsState["contextMenu"]) => void;
  setCwd: (p: string) => void;
  setOnline: (v: boolean) => void;
  setWorkspace: (id: string | null) => void;
  setDock: (ids: string[]) => void;
  setMobileApp: (id: string | null) => void;
  setWallpaperOverride: (v: string | null) => void;
  setLocked: (v: boolean) => void;
  setMission: (v: boolean) => void;
  setIcons: (icons: DeskIcon[]) => void;
  selectIcons: (ids: string[], additive?: boolean) => void;
  toggleIcon: (id: string) => void;
  moveIcons: (ids: string[], dx: number, dy: number) => void;
  setRubber: (r: OsState["rubber"]) => void;
  hydrateLayout: (windows: OsWindow[]) => void;
  serialize: () => OsWindow[];
};

function viewport() {
  if (typeof window === "undefined") return { w: 1280, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight };
}

function isMobile() {
  return viewport().w < 720;
}

function workArea() {
  const { w, h } = viewport();
  const mobile = w < 720;
  return { x: 0, y: 36, w, h: h - 36 - (mobile ? 64 : 72) };
}

function clampWin(win: OsWindow): OsWindow {
  const { w, h } = viewport();
  const menubar = 36;
  const dock = 84;
  const ww = Math.min(Math.max(win.w, 280), w);
  const hh = Math.min(Math.max(win.h, 200), Math.max(200, h - menubar - 20));
  const x = Math.min(Math.max(0, win.x), Math.max(0, w - 80));
  const y = Math.min(Math.max(menubar, win.y), Math.max(menubar, h - dock - 40));
  return { ...win, x, y, w: ww, h: hh };
}

export function snapFromPoint(x: number, y: number): SnapPreview {
  const area = workArea();
  const edge = 22;
  const midY = area.y + area.h / 2;
  if (y < area.y + edge) return { x: area.x, y: area.y, w: area.w, h: area.h, kind: "max" };
  if (x < edge && y < midY) return { x: area.x, y: area.y, w: Math.floor(area.w / 2), h: Math.floor(area.h / 2), kind: "tl" };
  if (x < edge && y >= midY) return { x: area.x, y: midY, w: Math.floor(area.w / 2), h: Math.ceil(area.h / 2), kind: "bl" };
  if (x > area.w - edge && y < midY)
    return { x: Math.floor(area.w / 2), y: area.y, w: Math.ceil(area.w / 2), h: Math.floor(area.h / 2), kind: "tr" };
  if (x > area.w - edge && y >= midY)
    return { x: Math.floor(area.w / 2), y: midY, w: Math.ceil(area.w / 2), h: Math.ceil(area.h / 2), kind: "br" };
  if (x < edge) return { x: area.x, y: area.y, w: Math.floor(area.w / 2), h: area.h, kind: "left" };
  if (x > area.w - edge) return { x: Math.floor(area.w / 2), y: area.y, w: Math.ceil(area.w / 2), h: area.h, kind: "right" };
  return null;
}

function snapRect(kind: string): NonNullable<SnapPreview> {
  const a = workArea();
  const hw = Math.floor(a.w / 2);
  const hh = Math.floor(a.h / 2);
  if (kind === "max") return { x: a.x, y: a.y, w: a.w, h: a.h, kind };
  if (kind === "left") return { x: a.x, y: a.y, w: hw, h: a.h, kind };
  if (kind === "right") return { x: a.x + hw, y: a.y, w: a.w - hw, h: a.h, kind };
  if (kind === "tl") return { x: a.x, y: a.y, w: hw, h: hh, kind };
  if (kind === "tr") return { x: a.x + hw, y: a.y, w: a.w - hw, h: hh, kind };
  if (kind === "bl") return { x: a.x, y: a.y + hh, w: hw, h: a.h - hh, kind };
  if (kind === "br") return { x: a.x + hw, y: a.y + hh, w: a.w - hw, h: a.h - hh, kind };
  return { x: a.x, y: a.y, w: a.w, h: a.h, kind: "max" };
}

let seq = 1;

export const useOs = create<OsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  windows: [],
  zTop: 10,
  focusedId: null,
  startOpen: false,
  paletteOpen: false,
  notifOpen: false,
  switcherOpen: false,
  snap: null,
  desktopIcons: DEFAULT_DOCK.slice(0, 6).map((id, i) => ({
    id: `desk_${id}`,
    appId: id,
    x: 18,
    y: 56 + i * 92,
    kind: "app" as const,
    label: APP_BY_ID[id]?.name,
  })),
  selection: [],
  rubber: null,
  contextMenu: null,
  cwd: "/Home",
  online: true,
  workspaceId: null,
  dockApps: DEFAULT_DOCK,
  mobileApp: null,
  wallpaperOverride: null,
  locked: false,
  missionOpen: false,
  setSettings: (s) => set({ settings: { ...get().settings, ...s } }),
  openApp: (appId, payload) => {
    const def: AppDef | undefined = APP_BY_ID[appId];
    if (!def) return null;
    const existing = def.singleton ? get().windows.find((w) => w.appId === appId) : undefined;
    if (existing) {
      const mobile = isMobile() && get().settings.mobileSingleWindow;
      set({
        windows: get().windows.map((w) => {
          if (w.id === existing.id)
            return { ...w, minimized: false, z: get().zTop + 1, payload: payload || w.payload, maximized: mobile ? true : w.maximized };
          if (mobile && !w.minimized) return { ...w, minimized: true };
          return w;
        }),
        zTop: get().zTop + 1,
        focusedId: existing.id,
        startOpen: false,
        paletteOpen: false,
        mobileApp: appId,
      });
      return existing.id;
    }
    const { w: vw, h: vh } = viewport();
    const mobile = vw < 720;
    const offset = (get().windows.length % 6) * 22;
    const id = `win_${seq++}_${appId}`;
    const z = get().zTop + 1;
    const win = clampWin({
      id,
      appId,
      title: def.name,
      x: mobile ? 0 : Math.round((vw - def.defaultSize.w) / 2) + offset,
      y: mobile ? 36 : 64 + offset,
      w: mobile ? vw : def.defaultSize.w,
      h: mobile ? vh - 36 - 64 : def.defaultSize.h,
      z,
      minimized: false,
      maximized: mobile,
      payload,
    });
    const others =
      mobile && get().settings.mobileSingleWindow
        ? get().windows.map((w) => ({ ...w, minimized: true }))
        : get().windows;
    set({
      windows: [...others, win],
      zTop: z,
      focusedId: id,
      startOpen: false,
      paletteOpen: false,
      mobileApp: appId,
    });
    return id;
  },
  focus: (id) => {
    const z = get().zTop + 1;
    const mobile = isMobile() && get().settings.mobileSingleWindow;
    const target = get().windows.find((w) => w.id === id);
    set({
      windows: get().windows.map((w) => {
        if (w.id === id) return { ...w, z, minimized: false, maximized: mobile ? true : w.maximized };
        if (mobile && !w.minimized) return { ...w, minimized: true };
        return w;
      }),
      zTop: z,
      focusedId: id,
      mobileApp: target?.appId ?? get().mobileApp,
    });
  },
  close: (id) => {
    const next = get().windows.filter((w) => w.id !== id);
    set({
      windows: next,
      focusedId: next.at(-1)?.id ?? null,
      mobileApp: next.at(-1)?.appId ?? null,
    });
  },
  minimize: (id) =>
    set({
      windows: get().windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
      focusedId: get().focusedId === id ? null : get().focusedId,
    }),
  toggleMax: (id) => {
    const area = workArea();
    set({
      windows: get().windows.map((w0) => {
        if (w0.id !== id) return w0;
        if (w0.maximized || w0.snapped === "max") {
          const prev = w0.prev || { x: 80, y: 80, w: 640, h: 420 };
          return { ...w0, maximized: false, snapped: null, ...prev };
        }
        return {
          ...w0,
          maximized: true,
          snapped: "max",
          prev: w0.prev || { x: w0.x, y: w0.y, w: w0.w, h: w0.h },
          x: area.x,
          y: area.y,
          w: area.w,
          h: area.h,
        };
      }),
    });
  },
  move: (id, x, y) =>
    set({
      windows: get().windows.map((w) =>
        w.id === id ? { ...w, x, y, maximized: false, snapped: w.snapped === "max" ? null : w.snapped } : w,
      ),
    }),
  resize: (id, x, y, w, h) =>
    set({
      windows: get().windows.map((win) =>
        win.id === id ? { ...win, x, y, w, h, maximized: false, snapped: null } : win,
      ),
    }),
  restoreWindow: (id) => get().focus(id),
  setSnap: (s) => set({ snap: s }),
  applySnap: (id, snap) =>
    set({
      windows: get().windows.map((w) =>
        w.id === id
          ? {
              ...w,
              x: snap.x,
              y: snap.y,
              w: snap.w,
              h: snap.h,
              maximized: snap.kind === "max",
              snapped: snap.kind,
              prev: w.prev || { x: w.x, y: w.y, w: w.w, h: w.h },
            }
          : w,
      ),
      snap: null,
    }),
  restoreFromSnap: (id) =>
    set({
      windows: get().windows.map((w) => {
        if (w.id !== id) return w;
        const prev = w.prev || { x: 80, y: 80, w: 640, h: 420 };
        return { ...w, ...prev, maximized: false, snapped: null };
      }),
    }),
  cascade: () => {
    set({
      windows: get().windows.map((w, i) =>
        w.minimized ? w : { ...w, maximized: false, snapped: null, x: 48 + i * 28, y: 56 + i * 28 },
      ),
    });
  },
  tile: (mode) => {
    const id = get().focusedId;
    if (mode === "quad") {
      const vis = get().windows.filter((x) => !x.minimized);
      if (!vis.length) return;
      const { w, h } = viewport();
      const cols = Math.ceil(Math.sqrt(vis.length));
      const rows = Math.ceil(vis.length / cols);
      const ww = Math.floor(w / cols);
      const hh = Math.floor((h - 36 - 72) / rows);
      set({
        windows: get().windows.map((win) => {
          if (win.minimized) return win;
          const i = vis.findIndex((v) => v.id === win.id);
          const c = i % cols;
          const r = Math.floor(i / cols);
          return { ...win, maximized: false, snapped: "quad", x: c * ww, y: 36 + r * hh, w: ww, h: hh };
        }),
      });
      return;
    }
    if (!id) return;
    const rect = snapRect(mode);
    get().applySnap(id, rect);
  },
  cycle: () => {
    const vis = get().windows.filter((w) => !w.minimized);
    if (!vis.length) return;
    vis.sort((a, b) => a.z - b.z);
    const focused = get().focusedId;
    const idx = vis.findIndex((w) => w.id === focused);
    const next = vis[(idx + 1) % vis.length];
    get().focus(next.id);
  },
  closeFocused: () => {
    const id = get().focusedId;
    if (id) get().close(id);
  },
  groupWindows: (ids) => {
    const groupId = `grp_${Date.now().toString(16)}`;
    set({
      windows: get().windows.map((w) => (ids.includes(w.id) ? { ...w, groupId } : w)),
    });
  },
  ungroup: (id) =>
    set({
      windows: get().windows.map((w) => (w.id === id ? { ...w, groupId: null } : w)),
    }),
  setStart: (v) => set({ startOpen: v, paletteOpen: v ? false : get().paletteOpen, notifOpen: false }),
  setPalette: (v) => set({ paletteOpen: v, startOpen: false, notifOpen: false }),
  setNotif: (v) => set({ notifOpen: v, startOpen: false, paletteOpen: false }),
  setSwitcher: (v) => set({ switcherOpen: v }),
  setContext: (m) => set({ contextMenu: m }),
  setCwd: (p) => set({ cwd: p }),
  setOnline: (v) => set({ online: v }),
  setWorkspace: (id) => set({ workspaceId: id }),
  setDock: (ids) => set({ dockApps: ids }),
  setMobileApp: (id) => set({ mobileApp: id }),
  setWallpaperOverride: (v) => set({ wallpaperOverride: v }),
  setLocked: (v) => set({ locked: v }),
  setMission: (v) => set({ missionOpen: v, startOpen: false, paletteOpen: false, notifOpen: false, switcherOpen: false }),
  setIcons: (icons) => set({ desktopIcons: icons }),
  selectIcons: (ids, additive) =>
    set({ selection: additive ? [...new Set([...get().selection, ...ids])] : ids }),
  toggleIcon: (id) =>
    set({
      selection: get().selection.includes(id) ? get().selection.filter((x) => x !== id) : [...get().selection, id],
    }),
  moveIcons: (ids, dx, dy) =>
    set({
      desktopIcons: get().desktopIcons.map((ic) =>
        ids.includes(ic.id) ? { ...ic, x: Math.max(8, ic.x + dx), y: Math.max(44, ic.y + dy) } : ic,
      ),
    }),
  setRubber: (r) => set({ rubber: r }),
  hydrateLayout: (windows) =>
    set({
      windows: windows.map((w, i) => ({ ...w, z: 10 + i })),
      zTop: 10 + windows.length,
      focusedId: windows.at(-1)?.id ?? null,
    }),
  serialize: () => get().windows,
}));
