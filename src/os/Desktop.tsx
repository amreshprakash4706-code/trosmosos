import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  bootOs,
  listNotificationsFn,
  loadLayoutFn,
  markNotifFn,
  saveLayoutFn,
  searchFn,
  workspacesFn,
  switchWorkspaceFn,
} from "@/lib/trosmos/api";
import { APP_BY_ID, APP_CATALOG } from "@/lib/trosmos/catalog";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { UserButton } from "@/lib/auth/gates";
import { AppGlyph } from "./icons";
import { useOs, type OsWindow } from "./store";
import { WindowFrame } from "./Window";
import { Wifi, WifiOff, Bell, Search, Grid3x3, Layers } from "lucide-react";

export function DesktopShell() {
  const user = useCurrentUser();
  const windows = useOs((s) => s.windows);
  const snap = useOs((s) => s.snap);
  const settings = useOs((s) => s.settings);
  const startOpen = useOs((s) => s.startOpen);
  const paletteOpen = useOs((s) => s.paletteOpen);
  const notifOpen = useOs((s) => s.notifOpen);
  const switcherOpen = useOs((s) => s.switcherOpen);
  const contextMenu = useOs((s) => s.contextMenu);
  const online = useOs((s) => s.online);
  const desktopIcons = useOs((s) => s.desktopIcons);
  const dockApps = useOs((s) => s.dockApps);
  const [clock, setClock] = useState(new Date());
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<{ id: string; kind: string; title: string; subtitle?: string; path?: string }>>([]);

  const boot = useQuery({
    queryKey: ["trosmos-boot"],
    queryFn: () => bootOs(),
  });
  const notifs = useQuery({
    queryKey: ["trosmos-notifs"],
    queryFn: () => listNotificationsFn(),
    refetchInterval: 12000,
  });

  useEffect(() => {
    if (!boot.data) return;
    useOs.getState().setSettings(boot.data.settings);
    document.documentElement.style.setProperty("--accent", boot.data.settings.accentColor);
    document.documentElement.classList.toggle("reduce-motion", boot.data.settings.reduceMotion);
    document.documentElement.classList.toggle("high-contrast", boot.data.settings.highContrast);
    const active = (boot.data.workspaces as Array<{ id: string; is_active: boolean | string }>).find(
      (w) => w.is_active === true || w.is_active === "t",
    );
    if (active) {
      useOs.getState().setWorkspace(active.id);
      void loadLayoutFn({ data: { workspaceId: active.id } }).then((layout) => {
        if (Array.isArray(layout) && layout.length) {
          useOs.getState().hydrateLayout(layout as OsWindow[]);
        }
      });
    }
    const reminders = boot.data.reminders as { todos?: Array<{ title: string }>; events?: Array<{ title: string }> };
    if (reminders?.todos?.length || reminders?.events?.length) {
      /* due items already stored as notifications by jobs/boot; surface via notification center */
    }
  }, [boot.data]);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    const on = () => useOs.getState().setOnline(navigator.onLine);
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useOs.getState().setPalette(!useOs.getState().paletteOpen);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        useOs.getState().openApp("ai");
      }
      if (e.altKey && e.key === "Tab") {
        e.preventDefault();
        useOs.getState().setSwitcher(true);
        useOs.getState().cycle();
      }
      if (e.key === "Escape") {
        const s = useOs.getState();
        if (s.paletteOpen) return s.setPalette(false);
        if (s.startOpen) return s.setStart(false);
        if (s.notifOpen) return s.setNotif(false);
        if (s.contextMenu) return s.setContext(null);
        s.closeFocused();
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        useOs.getState().tile("left");
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        useOs.getState().tile("right");
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === "q") {
        e.preventDefault();
        useOs.getState().tile("quad");
      }
      if ((e.metaKey || e.ctrlKey) && "1234567".includes(e.key)) {
        e.preventDefault();
        const id = useOs.getState().dockApps[Number(e.key) - 1];
        if (id) useOs.getState().openApp(id);
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

  const unread = useMemo(
    () =>
      ((notifs.data as Array<{ is_read: boolean | string | number }> | undefined) || []).filter(
        (n) => n.is_read !== true && n.is_read !== "t" && n.is_read !== 1,
      ).length,
    [notifs.data],
  );

  const time = settings.clockFormat === "12h" ? clock.toLocaleTimeString() : clock.toLocaleTimeString(undefined, { hour12: false });

  return (
    <div
      className={`relative h-full min-h-0 overflow-hidden wallpaper-${settings.wallpaper || "aurora"} ${settings.reduceMotion ? "reduce-motion" : ""} ${settings.largePointer ? "large-pointer" : ""}`}
      onClick={() => {
        useOs.getState().setStart(false);
        useOs.getState().setContext(null);
      }}
    >
      <header className="relative z-50 flex h-9 items-center justify-between border-b border-white/10 bg-black/30 px-3 text-xs backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="font-display text-sm"
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
          {online ? <Wifi size={14} /> : <WifiOff size={14} className="text-amber-300" />}
          <button
            type="button"
            className="relative"
            aria-label="Notifications"
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
          <span className="tabular-nums">{time}</span>
        </div>
      </header>

      {settings.showDesktopIcons ? (
        <div className="absolute inset-0 top-9">
          {desktopIcons.map((ic) => {
            const def = APP_BY_ID[ic.appId];
            if (!def) return null;
            return (
              <button
                key={ic.id}
                type="button"
                style={{ left: ic.x, top: ic.y }}
                className="absolute flex w-20 flex-col items-center gap-1 text-center"
                onDoubleClick={() => useOs.getState().openApp(ic.appId)}
              >
                <AppGlyph id={ic.appId} icon={def.icon} size={18} />
                <span className="text-[11px] drop-shadow">{def.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {snap ? (
        <div
          className="pointer-events-none absolute rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent)]/10"
          style={{ left: snap.x, top: snap.y, width: snap.w, height: snap.h, zIndex: 40 }}
        />
      ) : null}

      {windows.map((w) => (
        <WindowFrame key={w.id} win={w} />
      ))}

      <nav className="absolute bottom-3 left-1/2 z-[60] flex -translate-x-1/2 items-end gap-1 rounded-2xl border border-white/10 bg-black/35 px-2 py-2 backdrop-blur-2xl">
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
              className={`dock-icon ${settings.dockMagnify ? "" : ""}`}
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
          <div
            className="glass-strong w-[min(92vw,560px)] rounded-2xl p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={q}
              onChange={async (e) => {
                setQ(e.target.value);
                if (e.target.value.trim().length >= 2) {
                  const res = await searchFn({ data: { query: e.target.value } });
                  setHits(res.results as typeof hits);
                } else {
                  setHits(
                    APP_CATALOG.filter((a) => a.name.toLowerCase().includes(e.target.value.toLowerCase())).map((a) => ({
                      id: a.id,
                      kind: "app",
                      title: a.name,
                      subtitle: a.description,
                      path: undefined as string | undefined,
                    })),
                  );
                }
              }}
              placeholder="Search apps, files, notes…"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 outline-none"
            />
            <div className="mt-2 max-h-80 overflow-auto">
              {(hits.length ? hits : APP_CATALOG.map((a) => ({ id: a.id, kind: "app", title: a.name, subtitle: a.description, path: undefined as string | undefined }))).map(
                (h) => (
                  <button
                    key={h.kind + h.id}
                    type="button"
                    className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/8"
                    onClick={() => {
                      if (h.kind === "app") useOs.getState().openApp(h.id);
                      else if (h.kind === "note") useOs.getState().openApp("notes");
                      else if (h.kind === "task") useOs.getState().openApp("tasks");
                      else if (h.path) useOs.getState().openApp("files", { path: h.path });
                      useOs.getState().setPalette(false);
                    }}
                  >
                    <div className="text-[10px] uppercase text-faint">{h.kind}</div>
                    <div>{h.title}</div>
                  </button>
                ),
              )}
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
          {((notifs.data as Array<{ id: string; title: string; body: string | null; created_at: string }> | undefined) || []).map(
            (n) => (
              <article key={n.id} className="mb-2 rounded-xl bg-white/5 p-2 text-sm">
                <div>{n.title}</div>
                {n.body ? <div className="text-xs text-muted">{n.body}</div> : null}
              </article>
            ),
          )}
        </aside>
      ) : null}

      {switcherOpen ? (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-black/40" onClick={() => useOs.getState().setSwitcher(false)}>
          <div className="flex gap-3">
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

      {contextMenu ? (
        <ul
          className="glass-strong fixed z-[90] min-w-40 rounded-xl py-1 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.items.map((it) => (
            <li key={it.action}>
              <button type="button" className={`block w-full px-3 py-1.5 text-left hover:bg-white/10 ${it.danger ? "text-rose-300" : ""}`} onClick={() => {
                contextMenu.onAction?.(it.action);
                useOs.getState().setContext(null);
              }}>
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

      <WorkspaceStrip />
      <MobileDock />
    </div>
  );
}

function WorkspaceStrip() {
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
            useOs.getState().setWorkspace(w.id);
            const layout = await loadLayoutFn({ data: { workspaceId: w.id } });
            if (Array.isArray(layout) && layout.length) {
              useOs.getState().hydrateLayout(layout as OsWindow[]);
            } else {
              useOs.getState().hydrateLayout([]);
            }
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
