import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  applyMutationFn,
  bootOs,
  createFileFn,
  dismissNotifFn,
  listNotificationsFn,
  loadDesktopFn,
  loadLayoutFn,
  markNotifFn,
  notificationActionFn,
  saveDesktopFn,
  saveLayoutFn,
  searchFn,
  searchHistoryFn,
  switchWorkspaceFn,
  workspacesFn,
  decode,
} from "@/lib/trosmos/api";
import { APP_BY_ID, APP_CATALOG } from "@/lib/trosmos/catalog";
import { flushQueue } from "@/lib/trosmos/offline";
import { formatShortcut, matchShortcut } from "@/lib/trosmos/shortcuts";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { UserButton } from "@/lib/auth/gates";
import { AppGlyph } from "./icons";
import { useOs, type DeskIcon, type OsWindow } from "./store";
import { WindowFrame } from "./Window";
import { Wifi, WifiOff, Bell, Search, Grid3x3, Layers } from "lucide-react";

type Notif = {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean | string | number;
  created_at: string;
  category?: string;
  data_json?: string | null;
};

function parseNotifData(raw: string | null | undefined): { kind?: string; id?: string } {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { kind?: string; id?: string };
  } catch {
    return {};
  }
}

export function DesktopShell() {
  const user = useCurrentUser();
  const windows = useOs((s) => s.windows);
  const snap = useOs((s) => s.snap);
  const settings = useOs((s) => s.settings);
  const startOpen = useOs((s) => s.startOpen);
  const paletteOpen = useOs((s) => s.paletteOpen);
  const notifOpen = useOs((s) => s.notifOpen);
  const switcherOpen = useOs((s) => s.switcherOpen);
  const missionOpen = useOs((s) => s.missionOpen);
  const contextMenu = useOs((s) => s.contextMenu);
  const online = useOs((s) => s.online);
  const desktopIcons = useOs((s) => s.desktopIcons);
  const selection = useOs((s) => s.selection);
  const rubber = useOs((s) => s.rubber);
  const dockApps = useOs((s) => s.dockApps);
  const wallpaperOverride = useOs((s) => s.wallpaperOverride);
  const locked = useOs((s) => s.locked);
  const [clock, setClock] = useState(new Date());
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<{ id: string; kind: string; title: string; subtitle?: string; path?: string }>>([]);
  const [history, setHistory] = useState<Array<{ query: string }>>([]);
  const rubberOrigin = useRef<{ x: number; y: number } | null>(null);
  const iconDrag = useRef<{ ids: string[]; x: number; y: number } | null>(null);

  const boot = useQuery({
    queryKey: ["trosmos-boot"],
    queryFn: () => bootOs(),
  });
  const notifs = useQuery({
    queryKey: ["trosmos-notifs"],
    queryFn: () => listNotificationsFn(),
    refetchInterval: 12000,
  });

  async function hydrateWorkspace(workspaceId: string) {
    useOs.getState().setWorkspace(workspaceId);
    const [layout, desk] = await Promise.all([
      loadLayoutFn({ data: { workspaceId } }),
      loadDesktopFn({ data: { workspaceId } }).catch(() => null),
    ]);
    if (Array.isArray(layout) && layout.length) {
      useOs.getState().hydrateLayout(layout as OsWindow[]);
    } else {
      useOs.getState().hydrateLayout([]);
    }
    if (desk) {
      const layoutDesk = decode<{ icons?: DeskIcon[]; dock?: string[] | null; wallpaper?: string | null }>(desk);
      if (layoutDesk.icons?.length) useOs.getState().setIcons(layoutDesk.icons);
      if (layoutDesk.dock?.length) useOs.getState().setDock(layoutDesk.dock);
      useOs.getState().setWallpaperOverride(layoutDesk.wallpaper ?? null);
    }
  }

  useEffect(() => {
    if (!boot.data) return;
    const data = boot.data as {
      settings: typeof settings;
      workspaces: Array<{ id: string; is_active: boolean | string }>;
    };
    useOs.getState().setSettings(data.settings);
    document.documentElement.style.setProperty("--accent", data.settings.accentColor);
    document.documentElement.classList.toggle("reduce-motion", data.settings.reduceMotion);
    document.documentElement.classList.toggle("high-contrast", data.settings.highContrast);
    const active = data.workspaces.find((w) => w.is_active === true || w.is_active === "t");
    if (!active) return;
    const live = useOs.getState();
    if (!live.workspaceId && live.windows.length) {
      live.setWorkspace(active.id);
      void loadDesktopFn({ data: { workspaceId: active.id } })
        .then((desk) => {
          const layoutDesk = decode<{ icons?: DeskIcon[]; dock?: string[] | null; wallpaper?: string | null }>(desk);
          if (layoutDesk.icons?.length) useOs.getState().setIcons(layoutDesk.icons);
          if (layoutDesk.dock?.length) useOs.getState().setDock(layoutDesk.dock);
          if (layoutDesk.wallpaper) useOs.getState().setWallpaperOverride(layoutDesk.wallpaper);
        })
        .catch(() => undefined);
      return;
    }
    if (live.workspaceId === active.id) return;
    void hydrateWorkspace(active.id);
  }, [boot.data]);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    const on = () => {
      const next = navigator.onLine;
      useOs.getState().setOnline(next);
      if (next) {
        void flushQueue((rec) =>
          applyMutationFn({
            data: { op: rec.op, idempotencyKey: rec.idempotencyKey, payload: rec.payload as never },
          }),
        );
      }
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    on();
    return () => {
      window.clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable;
      const hit = matchShortcut({
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        key: e.key,
      });
      const s = useOs.getState();
      if (!hit && !typing) {
        if (e.key === "Enter" && s.selection.length) {
          e.preventDefault();
          const ic = s.desktopIcons.find((i) => i.id === s.selection[0]);
          if (ic?.path) s.openApp(ic.appId || "files", { path: ic.path });
          else if (ic?.appId) s.openApp(ic.appId);
          return;
        }
        if ((e.key === "Delete" || e.key === "Backspace") && s.selection.length && !s.focusedId) {
          e.preventDefault();
          s.setIcons(s.desktopIcons.filter((ic) => !s.selection.includes(ic.id)));
          s.selectIcons([]);
          return;
        }
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && s.desktopIcons.length) {
          e.preventDefault();
          const icons = [...s.desktopIcons].sort((a, b) => a.y - b.y || a.x - b.x);
          const cur = icons.findIndex((ic) => s.selection.includes(ic.id));
          let next = cur < 0 ? 0 : cur;
          if (e.key === "ArrowDown" || e.key === "ArrowRight") next = Math.min(icons.length - 1, next + 1);
          else next = Math.max(0, next - 1);
          s.selectIcons([icons[next].id]);
          return;
        }
      }
      if (!hit) return;
      if (typing && hit.action !== "escape" && hit.action !== "save" && hit.action !== "find") return;
      if (hit.action === "palette") {
        e.preventDefault();
        s.setPalette(!s.paletteOpen);
      } else if (hit.action === "ai") {
        e.preventDefault();
        s.openApp("ai");
      } else if (hit.action === "search") {
        e.preventDefault();
        s.openApp("search");
      } else if (hit.action === "launcher") {
        e.preventDefault();
        s.setStart(!s.startOpen);
      } else if (hit.action === "overview") {
        e.preventDefault();
        s.setMission(!s.missionOpen);
      } else if (hit.action === "cycle") {
        e.preventDefault();
        s.setSwitcher(true);
        s.cycle();
      } else if (hit.action === "close") {
        e.preventDefault();
        s.closeFocused();
      } else if (hit.action === "minimize") {
        e.preventDefault();
        if (s.focusedId) s.minimize(s.focusedId);
      } else if (hit.action === "maximize") {
        e.preventDefault();
        if (s.focusedId) s.toggleMax(s.focusedId);
      } else if (hit.action === "snap-left") {
        e.preventDefault();
        s.tile("left");
      } else if (hit.action === "snap-right") {
        e.preventDefault();
        s.tile("right");
      } else if (hit.action === "snap-max") {
        e.preventDefault();
        s.tile("max");
      } else if (hit.action === "tile-quad") {
        e.preventDefault();
        s.tile("quad");
      } else if (hit.action === "escape") {
        if (s.missionOpen) return s.setMission(false);
        if (s.paletteOpen) return s.setPalette(false);
        if (s.startOpen) return s.setStart(false);
        if (s.notifOpen) return s.setNotif(false);
        if (s.switcherOpen) return s.setSwitcher(false);
        if (s.contextMenu) return s.setContext(null);
        s.closeFocused();
      } else if (hit.action === "lock") {
        e.preventDefault();
        s.setLocked(true);
      } else if (hit.action === "files") {
        e.preventDefault();
        s.openApp("files");
      } else if (hit.action === "terminal") {
        e.preventDefault();
        s.openApp("terminal");
      } else if (hit.action === "notes") {
        e.preventDefault();
        s.openApp("notes");
      } else if (hit.action === "tasks") {
        e.preventDefault();
        s.openApp("tasks");
      } else if (hit.action === "settings") {
        e.preventDefault();
        s.openApp("settings");
      } else if (hit.action.startsWith("dock-")) {
        e.preventDefault();
        const id = s.dockApps[Number(hit.action.slice(5)) - 1];
        if (id) s.openApp(id);
      } else if (hit.action === "select-all" && !typing) {
        e.preventDefault();
        s.selectIcons(s.desktopIcons.map((i) => i.id));
      } else if (hit.action.startsWith("workspace-") && !typing) {
        e.preventDefault();
        const idx = Number(hit.action.slice("workspace-".length)) - 1;
        void workspacesFn().then((list) => {
          const ws = (list as Array<{ id: string }>)[idx];
          if (ws) {
            void switchWorkspaceFn({ data: { id: ws.id } }).then(() => hydrateWorkspace(ws.id));
          }
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const ws = useOs.getState().workspaceId;
      if (!ws) return;
      void saveLayoutFn({ data: { workspaceId: ws, layout: useOs.getState().serialize() } });
    }, 800);
    return () => window.clearTimeout(id);
  }, [windows]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const ws = useOs.getState().workspaceId;
      if (!ws) return;
      void saveDesktopFn({
        data: {
          workspaceId: ws,
          icons: useOs.getState().desktopIcons.map((ic) => ({
            id: ic.id,
            appId: ic.appId,
            path: ic.path,
            kind: ic.kind ?? (ic.path ? "file" : "app"),
            x: ic.x,
            y: ic.y,
            label: ic.label,
          })),
          dock: useOs.getState().dockApps,
          wallpaper: useOs.getState().wallpaperOverride,
        },
      });
    }, 900);
    return () => window.clearTimeout(id);
  }, [desktopIcons, dockApps, wallpaperOverride]);

  const unread = useMemo(
    () =>
      ((notifs.data as Notif[] | undefined) || []).filter(
        (n) => n.is_read !== true && n.is_read !== "t" && n.is_read !== 1,
      ).length,
    [notifs.data],
  );

  const time =
    settings.clockFormat === "12h" ? clock.toLocaleTimeString() : clock.toLocaleTimeString(undefined, { hour12: false });
  const paper = wallpaperOverride || settings.wallpaper || "aurora";

  function openHit(h: { id: string; kind: string; path?: string }) {
    if (h.kind === "app") useOs.getState().openApp(h.id);
    else if (h.kind === "note") useOs.getState().openApp("notes", { noteId: h.id });
    else if (h.kind === "task") useOs.getState().openApp("tasks", { taskId: h.id });
    else if (h.kind === "event") useOs.getState().openApp("calendar", { eventId: h.id });
    else if (h.kind === "setting") useOs.getState().openApp("settings");
    else if (h.path) useOs.getState().openApp("files", { path: h.path });
    useOs.getState().setPalette(false);
  }

  return (
    <div
      className={`relative h-full min-h-0 overflow-hidden wallpaper-${paper} ${settings.reduceMotion ? "reduce-motion" : ""} ${settings.largePointer ? "large-pointer" : ""}`}
      onClick={() => {
        useOs.getState().setStart(false);
        useOs.getState().setContext(null);
        useOs.getState().selectIcons([]);
      }}
    >
      <a href="#desktop-main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-black focus:p-2">
        Skip to desktop
      </a>
      <header className="relative z-50 flex h-9 items-center justify-between border-b border-white/10 bg-black/30 px-3 text-xs backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="font-display text-sm"
            aria-expanded={startOpen}
            onClick={(e) => {
              e.stopPropagation();
              useOs.getState().setStart(!startOpen);
            }}
          >
            Trosmos
          </button>
          <span className="hidden text-faint sm:inline">{user?.displayName || "Operator"}</span>
        </div>
        <div className="flex items-center gap-2">
          {online ? <Wifi size={14} aria-label="Online" /> : <WifiOff size={14} className="text-amber-300" aria-label="Offline" />}
          <button
            type="button"
            className="relative"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              useOs.getState().setNotif(!notifOpen);
            }}
          >
            <Bell size={14} />
            {unread ? (
              <span className="absolute -right-1 -top-1 size-3 rounded-full bg-rose-500 text-[9px] leading-3">{unread}</span>
            ) : null}
          </button>
          <button type="button" aria-label="Search" onClick={() => useOs.getState().setPalette(true)}>
            <Search size={14} />
          </button>
          <button type="button" aria-label="Mission Control" onClick={() => useOs.getState().setMission(true)}>
            <Layers size={14} />
          </button>
          <span className="tabular-nums">{time}</span>
        </div>
      </header>

      <div
        id="desktop-main"
        className="absolute inset-0 top-9"
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest("[data-desk-icon]")) return;
          e.preventDefault();
          useOs.getState().setContext({
            x: e.clientX,
            y: e.clientY,
            items: [
              { label: "Mission Control", action: "mission" },
              { label: "Tile windows", action: "tile" },
              { label: "New Files window", action: "files" },
              { label: "Change wallpaper", action: "wallpaper" },
            ],
            onAction: (action) => {
              const s = useOs.getState();
              if (action === "mission") s.setMission(true);
              if (action === "tile") s.tile("quad");
              if (action === "files") s.openApp("files");
              if (action === "wallpaper") {
                const order = ["aurora", "nebula", "dusk", "void"] as const;
                const cur = s.wallpaperOverride || s.settings.wallpaper || "aurora";
                const next = order[(order.indexOf(cur as (typeof order)[number]) + 1) % order.length];
                s.setWallpaperOverride(next);
              }
            },
          });
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest("[data-desk-icon]")) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          rubberOrigin.current = { x, y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          useOs.getState().setRubber({ x, y, w: 0, h: 0 });
          useOs.getState().selectIcons([]);
        }}
        onPointerMove={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          if (iconDrag.current) {
            const dx = e.clientX - iconDrag.current.x;
            const dy = e.clientY - iconDrag.current.y;
            iconDrag.current = { ...iconDrag.current, x: e.clientX, y: e.clientY };
            useOs.getState().moveIcons(iconDrag.current.ids, dx, dy);
            return;
          }
          if (!rubberOrigin.current) return;
          const x = Math.min(rubberOrigin.current.x, px);
          const y = Math.min(rubberOrigin.current.y, py);
          const w = Math.abs(px - rubberOrigin.current.x);
          const h = Math.abs(py - rubberOrigin.current.y);
          useOs.getState().setRubber({ x, y, w, h });
          const ids = useOs
            .getState()
            .desktopIcons.filter((ic) => ic.x + 80 > x && ic.x < x + w && ic.y + 72 > y && ic.y < y + h)
            .map((ic) => ic.id);
          useOs.getState().selectIcons(ids);
        }}
        onPointerUp={() => {
          rubberOrigin.current = null;
          iconDrag.current = null;
          useOs.getState().setRubber(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const vfsPath = e.dataTransfer.getData("application/x-trosmos-path");
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          if (vfsPath) {
            const name = vfsPath.slice(vfsPath.lastIndexOf("/") + 1) || "Item";
            const icons = useOs.getState().desktopIcons;
            useOs.getState().setIcons([
              ...icons,
              {
                id: `desk_file_${Date.now().toString(16)}`,
                appId: name.includes(".") ? "editor" : "files",
                path: vfsPath,
                kind: "file",
                x,
                y,
                label: name,
              },
            ]);
            return;
          }
          const files = e.dataTransfer.files;
          if (!files?.length) return;
          void (async () => {
            for (const file of Array.from(files)) {
              try {
                const buf = await file.arrayBuffer();
                const isText = file.type.startsWith("text/") || /\.(md|json|txt|js|ts|css|html|svg)$/i.test(file.name);
                let created: { path?: string; name?: string } | null = null;
                if (isText) {
                  created = decode<{ path: string; name: string }>(
                    await createFileFn({
                      data: { parent: "/Home/Desktop", name: file.name, content: new TextDecoder().decode(buf) },
                    }),
                  );
                } else {
                  const bytes = new Uint8Array(buf);
                  let bin = "";
                  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                  created = decode<{ path: string; name: string }>(
                    await createFileFn({
                      data: {
                        parent: "/Home/Desktop",
                        name: file.name,
                        content: btoa(bin),
                        encoding: "base64",
                      },
                    }),
                  );
                }
                if (created?.path) {
                  const icons = useOs.getState().desktopIcons;
                  useOs.getState().setIcons([
                    ...icons,
                    {
                      id: `desk_file_${Date.now().toString(16)}_${icons.length}`,
                      appId: /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name) ? "photos" : "editor",
                      path: created.path,
                      kind: "file",
                      x: x + icons.length * 8,
                      y: y + icons.length * 8,
                      label: created.name || file.name,
                    },
                  ]);
                }
              } catch {
                /* quota or auth */
              }
            }
          })();
        }}
      >
        {settings.showDesktopIcons
          ? desktopIcons.map((ic) => {
              const def = ic.appId ? APP_BY_ID[ic.appId] : null;
              const selected = selection.includes(ic.id);
              return (
                <button
                  key={ic.id}
                  type="button"
                  data-desk-icon
                  style={{ left: ic.x, top: ic.y }}
                  aria-pressed={selected}
                  className={`absolute flex w-20 flex-col items-center gap-1 text-center ${selected ? "rounded-xl bg-white/15 ring-1 ring-white/30" : ""}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey || e.metaKey || e.ctrlKey) useOs.getState().toggleIcon(ic.id);
                    else if (!selection.includes(ic.id)) useOs.getState().selectIcons([ic.id]);
                    iconDrag.current = {
                      ids: useOs.getState().selection.includes(ic.id) ? useOs.getState().selection : [ic.id],
                      x: e.clientX,
                      y: e.clientY,
                    };
                  }}
                  onDoubleClick={() => {
                    if (ic.path) {
                      const name = ic.path.toLowerCase();
                      if (/\.(png|jpe?g|gif|webp|svg)$/.test(name)) useOs.getState().openApp("photos", { path: ic.path });
                      else if (name.endsWith(".zip")) useOs.getState().openApp("archive", { path: ic.path });
                      else if (/\.(mp3|wav|ogg|mp4|webm)$/.test(name)) useOs.getState().openApp("media", { path: ic.path });
                      else if (name.endsWith(".pdf")) useOs.getState().openApp("viewer", { path: ic.path });
                      else useOs.getState().openApp(ic.appId || "files", { path: ic.path });
                    } else if (ic.appId) useOs.getState().openApp(ic.appId);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    useOs.getState().setContext({
                      x: e.clientX,
                      y: e.clientY,
                      items: [
                        { label: "Open", action: "open" },
                        { label: "Remove from desktop", action: "remove", danger: true },
                      ],
                      onAction: (action) => {
                        if (action === "open") {
                          if (ic.path) useOs.getState().openApp(ic.appId || "files", { path: ic.path });
                          else if (ic.appId) useOs.getState().openApp(ic.appId);
                        }
                        if (action === "remove") {
                          const next = useOs.getState().desktopIcons.filter((x) => x.id !== ic.id);
                          useOs.getState().setIcons(next);
                        }
                      },
                    });
                  }}
                >
                  <AppGlyph id={ic.appId || "files"} icon={def?.icon || "folder"} size={18} />
                  <span className="text-[11px] drop-shadow">{def?.name || ic.label || "Item"}</span>
                </button>
              );
            })
          : null}
        {rubber ? (
          <div
            className="pointer-events-none absolute border border-[var(--accent)] bg-[var(--accent)]/15"
            style={{ left: rubber.x, top: rubber.y, width: rubber.w, height: rubber.h }}
          />
        ) : null}
      </div>

      {snap ? (
        <div
          className="pointer-events-none absolute rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent)]/10"
          style={{ left: snap.x, top: snap.y, width: snap.w, height: snap.h, zIndex: 40 }}
        />
      ) : null}

      {windows.map((w) => (
        <WindowFrame key={w.id} win={w} />
      ))}

      <nav
        className={`absolute bottom-3 left-1/2 z-[60] hidden -translate-x-1/2 items-end gap-1 rounded-2xl border border-white/10 bg-black/35 px-2 py-2 backdrop-blur-2xl md:flex ${settings.compactDock ? "scale-90" : ""}`}
      >
        <button
          type="button"
          className="dock-icon grid size-11 place-items-center rounded-xl bg-white/10"
          aria-label="Launcher"
          onClick={(e) => {
            e.stopPropagation();
            useOs.getState().setStart(!startOpen);
          }}
        >
          <Grid3x3 size={18} />
        </button>
        {dockApps.map((id) => {
          const def = APP_BY_ID[id];
          if (!def) return null;
          const open = windows.some((w) => w.appId === id && !w.minimized);
          const min = windows.some((w) => w.appId === id && w.minimized);
          return (
            <button
              key={id}
              type="button"
              className={`dock-icon ${settings.dockMagnify ? "dock-magnify" : ""}`}
              aria-label={def.name}
              onClick={() => useOs.getState().openApp(id)}
            >
              <AppGlyph id={id} icon={def.icon} size={18} />
              <span className={`mx-auto mt-0.5 block h-1 w-1 rounded-full ${open ? "bg-white" : min ? "bg-white/40" : "bg-transparent"}`} />
            </button>
          );
        })}
      </nav>

      {startOpen ? (
        <div
          className="glass-strong absolute bottom-20 left-1/2 z-[70] w-[min(92vw,640px)] -translate-x-1/2 rounded-3xl p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg">Applications</h2>
            <UserButton />
          </div>
          <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">
            {APP_CATALOG.map((a) => (
              <button
                key={a.id}
                type="button"
                className="flex items-center gap-2 rounded-2xl p-2 text-left hover:bg-white/8"
                onClick={() => useOs.getState().openApp(a.id)}
              >
                <AppGlyph id={a.id} icon={a.icon} size={16} />
                <span>
                  <span className="block text-sm">{a.name}</span>
                  <span className="block text-[11px] text-muted">{a.category}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {paletteOpen ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-start bg-black/40 pt-[12vh]"
          onClick={() => useOs.getState().setPalette(false)}
        >
          <div className="glass-strong w-[min(92vw,560px)] rounded-2xl p-3" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={q}
              aria-label="Command palette"
              onFocus={() => {
                void searchHistoryFn().then((h) => setHistory(h as typeof history));
              }}
              onChange={async (e) => {
                setQ(e.target.value);
                if (e.target.value.trim().length >= 2) {
                  const res = decode<{ results: typeof hits }>(await searchFn({ data: { query: e.target.value } }), {
                    results: [],
                  });
                  setHits(res.results);
                } else {
                  setHits(
                    APP_CATALOG.filter((a) => a.name.toLowerCase().includes(e.target.value.toLowerCase())).map((a) => ({
                      id: a.id,
                      kind: "app",
                      title: a.name,
                      subtitle: a.description,
                    })),
                  );
                }
              }}
              placeholder="Search apps, files, notes…"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 outline-none"
            />
            {!q && history.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {history.slice(0, 8).map((h) => (
                  <button
                    key={h.query}
                    type="button"
                    className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-muted"
                    onClick={async () => {
                      setQ(h.query);
                      const res = decode<{ results: typeof hits }>(await searchFn({ data: { query: h.query } }), {
                        results: [],
                      });
                      setHits(res.results);
                    }}
                  >
                    {h.query}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-2 max-h-80 overflow-auto">
              {(hits.length
                ? hits
                : APP_CATALOG.map((a) => ({
                    id: a.id,
                    kind: "app",
                    title: a.name,
                    subtitle: a.description,
                    path: undefined as string | undefined,
                  }))
              ).map((h) => (
                <button
                  key={h.kind + h.id}
                  type="button"
                  className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/8"
                  onClick={() => openHit(h)}
                >
                  <div className="text-[10px] uppercase text-faint">{h.kind}</div>
                  <div>{h.title}</div>
                  {h.subtitle ? <div className="truncate text-[11px] text-muted">{h.subtitle}</div> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {notifOpen ? (
        <aside
          className="glass-strong absolute top-10 right-3 z-[70] w-80 max-h-[70vh] overflow-auto rounded-2xl p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex justify-between">
            <h2 className="font-display">Notifications</h2>
            <button
              type="button"
              className="text-xs text-muted"
              onClick={() => void markNotifFn({ data: { all: true } }).then(() => notifs.refetch())}
            >
              Mark all read
            </button>
          </div>
          {((notifs.data as Notif[] | undefined) || []).map((n) => {
            const data = parseNotifData(n.data_json);
            return (
              <article key={n.id} className="mb-2 rounded-xl bg-white/5 p-2 text-sm">
                <div>{n.title}</div>
                {n.body ? <div className="text-xs text-muted">{n.body}</div> : null}
                <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                  <button
                    type="button"
                    className="rounded bg-white/10 px-1.5 py-0.5"
                    onClick={() => {
                      if (data.kind === "task") useOs.getState().openApp("tasks", { taskId: data.id });
                      else if (data.kind === "event") useOs.getState().openApp("calendar", { eventId: data.id });
                      else if (n.category === "jobs") useOs.getState().openApp("monitor");
                      void notificationActionFn({ data: { id: n.id, action: "read" } }).then(() => notifs.refetch());
                    }}
                  >
                    Open
                  </button>
                  {data.kind === "task" ? (
                    <button
                      type="button"
                      className="rounded bg-white/10 px-1.5 py-0.5"
                      onClick={() =>
                        void notificationActionFn({ data: { id: n.id, action: "complete" } }).then(() => notifs.refetch())
                      }
                    >
                      Complete
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded bg-white/10 px-1.5 py-0.5"
                    onClick={() =>
                      void notificationActionFn({ data: { id: n.id, action: "snooze" } }).then(() => notifs.refetch())
                    }
                  >
                    Snooze 30m
                  </button>
                  <button
                    type="button"
                    className="rounded bg-white/10 px-1.5 py-0.5 text-rose-200"
                    onClick={() => void dismissNotifFn({ data: { id: n.id } }).then(() => notifs.refetch())}
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            );
          })}
        </aside>
      ) : null}

      {switcherOpen ? (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-black/40" onClick={() => useOs.getState().setSwitcher(false)}>
          <div className="flex flex-wrap gap-3">
            {windows.map((w) => (
              <button
                key={w.id}
                type="button"
                className="glass rounded-2xl p-4"
                onClick={() => {
                  useOs.getState().focus(w.id);
                  useOs.getState().setSwitcher(false);
                }}
              >
                {w.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {missionOpen ? (
        <div
          className="fixed inset-0 z-[85] bg-black/55 p-8 backdrop-blur-md"
          onClick={() => useOs.getState().setMission(false)}
        >
          <h2 className="mb-4 font-display text-xl">Mission Control</h2>
          <p className="mb-4 text-xs text-muted">{formatShortcut("Mod+Up")} to toggle · click a window to focus</p>
          <div className="mb-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="rounded-lg bg-white/10 px-3 py-1 text-xs"
              onClick={() => {
                const ids = useOs.getState().windows.filter((w) => !w.minimized).map((w) => w.id);
                if (ids.length > 1) useOs.getState().groupWindows(ids);
              }}
            >
              Group visible windows
            </button>
            <button
              type="button"
              className="rounded-lg bg-white/10 px-3 py-1 text-xs"
              onClick={() => {
                const s = useOs.getState();
                s.windows.forEach((w) => s.ungroup(w.id));
              }}
            >
              Ungroup all
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {windows.map((w) => (
              <button
                key={w.id}
                type="button"
                className="glass-strong rounded-2xl p-4 text-left"
                onClick={(e) => {
                  e.stopPropagation();
                  useOs.getState().focus(w.id);
                  useOs.getState().setMission(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <AppGlyph id={w.appId} icon={APP_BY_ID[w.appId]?.icon} size={14} />
                  <span className="truncate">{w.title}</span>
                </div>
                <div className="mt-2 text-[11px] text-muted">
                  {w.minimized ? "Minimized" : w.maximized ? "Maximized" : w.snapped || "Floating"}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <ul className="glass-strong fixed z-[90] min-w-40 rounded-xl py-1 text-sm" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.items.map((it) => (
            <li key={it.action}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left hover:bg-white/10 ${it.danger ? "text-rose-300" : ""}`}
                onClick={() => {
                  contextMenu.onAction?.(it.action);
                  useOs.getState().setContext(null);
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {boot.isError ? (
        <div className="absolute bottom-24 left-1/2 z-[90] -translate-x-1/2 rounded-xl bg-rose-500/20 px-3 py-2 text-sm">
          Could not boot Trosmos. Sign in again if this persists.
        </div>
      ) : null}

      {locked ? (
        <div className="aurora fixed inset-0 z-[120] grid place-items-center">
          <div className="glass-strong w-[min(92vw,360px)] rounded-3xl p-8 text-center">
            <div className="font-display text-2xl">Trosmos OS</div>
            <p className="mt-2 text-sm text-muted">{user?.displayName || "Session locked"}</p>
            <button
              type="button"
              className="mt-6 w-full rounded-xl bg-[var(--accent)] py-2 text-sm"
              onClick={() => useOs.getState().setLocked(false)}
            >
              Unlock
            </button>
          </div>
        </div>
      ) : null}

      <WorkspaceStrip onSwitch={hydrateWorkspace} />
      <MobileDock />
    </div>
  );
}

function WorkspaceStrip({ onSwitch }: { onSwitch: (id: string) => Promise<void> }) {
  const [list, setList] = useState<Array<{ id: string; name: string; is_active: boolean | string }>>([]);
  useEffect(() => {
    void workspacesFn().then((w) => setList(w as typeof list));
  }, []);
  if (list.length < 2) return null;
  return (
    <div className="absolute top-12 right-3 z-40 flex flex-col gap-1">
      {list.map((w) => (
        <button
          key={w.id}
          type="button"
          title={w.name}
          className={`size-2 rounded-full ${w.is_active === true || w.is_active === "t" ? "bg-white" : "bg-white/30"}`}
          onClick={async () => {
            await switchWorkspaceFn({ data: { id: w.id } });
            await onSwitch(w.id);
            setList((await workspacesFn()) as typeof list);
          }}
        />
      ))}
      <Layers size={12} className="mt-1 opacity-50" />
    </div>
  );
}

function MobileDock() {
  const mobile = useOs((s) => s.mobileApp);
  const dock = useOs((s) => s.dockApps);
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[65] flex justify-around border-t border-white/10 bg-black/50 py-2 backdrop-blur-xl md:hidden">
      {dock.slice(0, 5).map((id) => {
        const def = APP_BY_ID[id];
        if (!def) return null;
        return (
          <button
            key={id}
            type="button"
            className={`grid place-items-center ${mobile === id ? "opacity-100" : "opacity-70"}`}
            onClick={() => useOs.getState().openApp(id)}
            aria-label={def.name}
          >
            <AppGlyph id={id} icon={def.icon} size={16} />
          </button>
        );
      })}
    </nav>
  );
}
