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
  prev?: { x: number; y: number; w: number; h: number };
  payload?: { path?: string };
};

export type SnapPreview = { x: number; y: number; w: number; h: number; kind: string } | null;

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
  desktopIcons: Array<{ id: string; appId: string; x: number; y: number }>;
  selection: string[];
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
  setSettings: (s: Partial<OsSettings>) => void;
  openApp: (appId: string, payload?: { path?: string }) => string | null;
  focus: (id: string) => void;
  close: (id: string) => void;
  minimize: (id: string) => void;
  toggleMax: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, x: number, y: number, w: number, h: number) => void;
  restoreWindow: (id: string) => void;
  setSnap: (s: SnapPreview) => void;
  applySnap: (id: string, snap: NonNullable<SnapPreview>) => void;
  cascade: () => void;
  tile: (mode: "left" | "right" | "quad") => void;
  cycle: () => void;
  closeFocused: () => void;
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
  hydrateLayout: (windows: OsWindow[]) => void;
  serialize: () => OsWindow[];
};

function viewport() {
  if (typeof window === "undefined") return { w: 1280, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight };
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
  })),
  selection: [],
  contextMenu: null,
  cwd: "/Home",
  online: true,
  workspaceId: null,
  dockApps: DEFAULT_DOCK,
  mobileApp: null,
  setSettings: (s) => set({ settings: { ...get().settings, ...s } }),
  openApp: (appId, payload) => {
    const def: AppDef | undefined = APP_BY_ID[appId];
    if (!def) return null;
    const existing = def.singleton ? get().windows.find((w) => w.appId === appId) : undefined;
    if (existing) {
      set({
        windows: get().windows.map((w) =>
          w.id === existing.id
            ? { ...w, minimized: false, z: get().zTop + 1, payload: payload || w.payload }
            : w,
        ),
        zTop: get().zTop + 1,
        focusedId: existing.id,
        startOpen: false,
        paletteOpen: false,
        mobileApp: appId,
      });
      return existing.id;
    }
    const { w: vw, h: vh } = viewport();
    const isMobile = vw < 720;
    const offset = (get().windows.length % 6) * 22;
    const id = `win_${seq++}_${appId}`;
    const z = get().zTop + 1;
    const win = clampWin({
      id,
      appId,
      title: def.name,
      x: isMobile ? 0 : Math.round((vw - def.defaultSize.w) / 2) + offset,
      y: isMobile ? 36 : 64 + offset,
      w: isMobile ? vw : def.defaultSize.w,
      h: isMobile ? vh - 36 - 64 : def.defaultSize.h,
      z,
      minimized: false,
      maximized: isMobile,
      payload,
    });
    set({
      windows: [...get().windows, win],
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
    set({
      windows: get().windows.map((w) => (w.id === id ? { ...w, z, minimized: false } : w)),
      zTop: z,
      focusedId: id,
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
    const { w, h } = viewport();
    set({
      windows: get().windows.map((w0) => {
        if (w0.id !== id) return w0;
        if (w0.maximized) {
          const prev = w0.prev || { x: 80, y: 80, w: 640, h: 420 };
          return { ...w0, maximized: false, ...prev };
        }
        return {
          ...w0,
          maximized: true,
          prev: { x: w0.x, y: w0.y, w: w0.w, h: w0.h },
          x: 0,
          y: 36,
          w,
          h: h - 36 - 72,
        };
      }),
    });
  },
  move: (id, x, y) =>
    set({
      windows: get().windows.map((w) => (w.id === id ? { ...w, x, y, maximized: false } : w)),
    }),
  resize: (id, x, y, w, h) =>
    set({
      windows: get().windows.map((win) => (win.id === id ? { ...win, x, y, w, h, maximized: false } : win)),
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
              prev: w.prev || { x: w.x, y: w.y, w: w.w, h: w.h },
            }
          : w,
      ),
      snap: null,
    }),
  cascade: () => {
    set({
      windows: get().windows.map((w, i) =>
        w.minimized ? w : { ...w, maximized: false, x: 48 + i * 28, y: 56 + i * 28 },
      ),
    });
  },
  tile: (mode) => {
    const { w, h } = viewport();
    const vis = get().windows.filter((x) => !x.minimized);
    if (!vis.length) return;
    if (mode === "left" || mode === "right") {
      const id = get().focusedId;
      const area =
        mode === "left"
          ? { x: 0, y: 36, w: Math.floor(w / 2), h: h - 36 - 72 }
          : { x: Math.floor(w / 2), y: 36, w: Math.floor(w / 2), h: h - 36 - 72 };
      set({
        windows: get().windows.map((win) => (win.id === id ? { ...win, ...area, maximized: false } : win)),
      });
      return;
    }
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
        return { ...win, maximized: false, x: c * ww, y: 36 + r * hh, w: ww, h: hh };
      }),
    });
  },
  cycle: () => {
    const vis = get().windows.filter((w) => !w.minimized);
    if (!vis.length) return;
    vis.sort((a, b) => a.z - b.z);
    const next = vis[0];
    get().focus(next.id);
  },
  closeFocused: () => {
    const id = get().focusedId;
    if (id) get().close(id);
  },
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
  hydrateLayout: (windows) =>
    set({
      windows: windows.map((w, i) => ({ ...w, z: 10 + i })),
      zTop: 10 + windows.length,
      focusedId: windows.at(-1)?.id ?? null,
    }),
  serialize: () => get().windows,
}));
