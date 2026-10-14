import { useEffect, useState } from "react";
import {
  activityFn,
  clipboardClearFn,
  clipboardListFn,
  clipboardPushFn,
  listAppsFn,
  listDirFn,
  listJobsFn,
  workspacesFn,
  createWorkspaceFn,
  deleteWorkspaceFn,
  switchWorkspaceFn,
  readFileFn,
  searchFn,
  searchHistoryFn,
  setAppEnabledFn,
  statsFn,
  cancelJobFn,
  enqueueJobFn,
  loadDesktopFn,
  loadLayoutFn,
  zipExtractFn,
  zipListFn,
  decode,
} from "@/lib/trosmos/api";
import { OS_VERSION } from "@/lib/trosmos/core";
import { AppGlyph } from "@/os/icons";
import { useOs } from "@/os/store";
import { Empty, GhostBtn, Toolbar, errMsg } from "./ui";

type FilePayload = {
  path: string;
  name?: string;
  content: string;
  encoding?: "utf8" | "base64";
  mimeType?: string | null;
};

export function CalculatorApp() {
  const [expr, setExpr] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "=", "+", "C", "⌫", "(", ")"];
  function apply(k: string) {
    if (k === "C") return setExpr("");
    if (k === "⌫") return setExpr((e) => e.slice(0, -1));
    if (k === "=") {
      try {
        const v = evaluate(expr);
        setHist((h) => [`${expr} = ${v}`, ...h].slice(0, 12));
        setExpr(String(v));
      } catch {
        setExpr("Error");
      }
      return;
    }
    setExpr((e) => (e === "Error" ? k : e + k));
  }
  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 min-h-14 rounded-xl bg-black/30 px-3 py-2 text-right font-mono text-2xl">{expr || "0"}</div>
      <div className="grid grid-cols-4 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            className="rounded-xl bg-white/8 py-3 text-lg hover:bg-white/15"
            onClick={() => apply(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-1 overflow-auto text-xs text-muted">
        {hist.map((h) => (
          <div key={h}>{h}</div>
        ))}
      </div>
    </div>
  );
}

function evaluate(input: string): number {
  const tokens = input.match(/\d+\.?\d*|[+\-*/()]/g);
  if (!tokens || tokens.join("") !== input.replace(/\s/g, "")) throw new Error("bad");
  let i = 0;
  function peek() {
    return tokens![i];
  }
  function eat() {
    return tokens![i++];
  }
  function num(): number {
    const t = eat();
    if (t === "(") {
      const v = add();
      if (eat() !== ")") throw new Error("paren");
      return v;
    }
    if (t === "-") return -num();
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error("num");
    return n;
  }
  function mul(): number {
    let v = num();
    while (peek() === "*" || peek() === "/") {
      const op = eat();
      const r = num();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function add(): number {
    let v = mul();
    while (peek() === "+" || peek() === "-") {
      const op = eat();
      const r = mul();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const v = add();
  if (i !== tokens.length) throw new Error("trail");
  if (!Number.isFinite(v)) throw new Error("nan");
  return v;
}

export function ClockApp() {
  const [now, setNow] = useState(new Date());
  const [tab, setTab] = useState<"clock" | "timer" | "stop" | "world">("clock");
  const [secs, setSecs] = useState(300);
  const [left, setLeft] = useState<number | null>(null);
  const [lap, setLap] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (left == null) return;
    if (left <= 0) {
      setLeft(null);
      return;
    }
    const t = window.setTimeout(() => setLeft((x) => (x == null ? x : x - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setLap((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  const zones = ["UTC", "America/New_York", "Europe/London", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex gap-2">
        {(["clock", "timer", "stop", "world"] as const).map((t) => (
          <GhostBtn key={t} onClick={() => setTab(t)}>
            {t}
          </GhostBtn>
        ))}
      </div>
      {tab === "clock" ? (
        <div className="font-display text-5xl tabular-nums">{now.toLocaleTimeString()}</div>
      ) : null}
      {tab === "timer" ? (
        <div>
          <input
            type="number"
            value={secs}
            onChange={(e) => setSecs(Number(e.target.value))}
            className="mb-2 w-28 rounded-lg border border-white/10 bg-white/5 px-2 py-1"
          />
          <div className="font-display text-4xl">{left ?? secs}s</div>
          <GhostBtn onClick={() => setLeft(secs)}>Start</GhostBtn>
        </div>
      ) : null}
      {tab === "stop" ? (
        <div>
          <div className="font-display text-4xl tabular-nums">{lap}s</div>
          <GhostBtn onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Start"}</GhostBtn>
          <GhostBtn
            onClick={() => {
              setRunning(false);
              setLap(0);
            }}
          >
            Reset
          </GhostBtn>
        </div>
      ) : null}
      {tab === "world" ? (
        <div className="space-y-2">
          {zones.map((z) => (
            <div key={z} className="flex justify-between text-sm">
              <span>{z}</span>
              <span className="tabular-nums">{now.toLocaleTimeString(undefined, { timeZone: z })}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ClipboardApp() {
  const [items, setItems] = useState<Array<{ id: string; text: string; created_at: string }>>([]);
  async function refresh() {
    setItems((await clipboardListFn()) as typeof items);
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <GhostBtn
          onClick={async () => {
            try {
              const t = await navigator.clipboard.readText();
              await clipboardPushFn({ data: { text: t } });
              await refresh();
            } catch {
              /* permission */
            }
          }}
        >
          Capture
        </GhostBtn>
        <GhostBtn
          danger
          onClick={async () => {
            await clipboardClearFn();
            await refresh();
          }}
        >
          Clear
        </GhostBtn>
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto p-2 space-y-2">
        {!items.length ? <Empty title="No clipboard history" body="Copy text in Trosmos, then Capture. Browser permission is required." /> : null}
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className="block w-full rounded-xl bg-white/5 p-2 text-left text-sm"
            onClick={() => void navigator.clipboard.writeText(it.text)}
          >
            {it.text.slice(0, 400)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HelpApp() {
  return (
    <div className="h-full overflow-auto p-5 text-sm leading-relaxed">
      <h2 className="font-display text-2xl">Trosmos OS {OS_VERSION}</h2>
      <p className="mt-2 text-muted">
        A web operating environment: windows, a virtual filesystem, apps, and a capability-gated AI copilot.
      </p>
      <h3 className="mt-4 font-medium">Shortcuts</h3>
      <ul className="mt-1 space-y-1 text-muted">
        <li>Ctrl/⌘ K — command palette</li>
        <li>Ctrl/⌘ / — Trosmos AI</li>
        <li>Ctrl/⌘ ↑ — Mission Control</li>
        <li>Alt Tab — window switcher</li>
        <li>Esc — close overlay or focused window</li>
        <li>Ctrl/⌘ S — save in Editor</li>
        <li>Ctrl/⌘ F — find in Editor</li>
        <li>Ctrl/⌘ 1–7 — dock apps</li>
        <li>Ctrl/⌘ Alt ←/→ — snap focused window</li>
        <li>Ctrl/⌘ Alt Q — tile visible windows</li>
        <li>Ctrl/⌘ L — lock session</li>
        <li>Ctrl/⌘ Alt 1–3 — switch workspaces</li>
        <li>Files: drag items onto the desktop; rubber-band select icons</li>
        <li>Editor: tabs, find/replace, syntax overlay</li>
        <li>Notes: [[wiki links]], folders, backlinks, markdown export</li>
        <li>Tasks: kanban, recurrence, schedule onto Calendar</li>
      </ul>
      <h3 className="mt-4 font-medium">Honest limits</h3>
      <ul className="mt-1 space-y-1 text-muted">
        <li>The Terminal is a Trosmos shell, not Linux.</li>
        <li>Atlas can only embed sites that allow iframes.</li>
        <li>Uploads are capped at 1.5 MB per file.</li>
        <li>Jobs run while you use Trosmos, not as a always-on worker.</li>
      </ul>
    </div>
  );
}

export function PhotosApp({ payload }: { payload?: { path?: string } }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const path = typeof payload?.path === "string" ? payload.path : null;
    if (!path) return;
    void readFileFn({ data: { path } })
      .then((raw) => {
        const f = decode<FilePayload>(raw);
        if (f.encoding !== "base64" && !f.mimeType?.startsWith("image/") && !f.path.endsWith(".svg")) {
          setSrc(`data:image/svg+xml,${encodeURIComponent(f.content)}`);
        } else {
          const mime = f.mimeType || "image/png";
          setSrc(`data:${mime};base64,${f.encoding === "base64" ? f.content : btoa(f.content)}`);
        }
      })
      .catch((e) => setErr(errMsg(e)));
  }, [payload?.path]);
  if (err) return <Empty title="Could not open image" body={err} />;
  if (!src) return <Empty title="Photos" body="Open an image from Files." />;
  return (
    <div className="grid h-full place-items-center bg-black/40 p-4">
      <img src={src} alt="Preview" className="max-h-full max-w-full object-contain" />
    </div>
  );
}

export function ViewerApp({ payload }: { payload?: { path?: string } }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const path = typeof payload?.path === "string" ? payload.path : null;
    if (!path) return;
    void readFileFn({ data: { path } }).then((raw) => {
      const f = decode<FilePayload>(raw);
      const blob =
        f.encoding === "base64"
          ? b64blob(f.content, f.mimeType || "application/pdf")
          : new Blob([f.content], { type: f.mimeType || "text/plain" });
      setUrl(URL.createObjectURL(blob));
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [payload?.path]);
  if (!url) return <Empty title="Viewer" body="Open a PDF or document from Files." />;
  return <iframe title="Document" src={url} className="h-full w-full bg-white" />;
}

export function ArchiveApp({ payload }: { payload?: { path?: string } }) {
  const [info, setInfo] = useState<string>("Open a .zip from Files to list and extract it into Downloads.");
  const [entries, setEntries] = useState<Array<{ path: string; isDir: boolean; size: number }>>([]);
  const [path, setPath] = useState<string | null>(typeof payload?.path === "string" ? payload.path : null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function load(p: string) {
    setError(null);
    try {
      const listed = decode<{
        name: string;
        size: number;
        uncompressed: number;
        entries: Array<{ path: string; isDir: boolean; size: number }>;
        skipped: string[];
      }>(await zipListFn({ data: { path: p } }));
      setPath(p);
      setEntries(listed.entries);
      setInfo(
        `${listed.name} · ${listed.size} bytes stored · ${listed.uncompressed} uncompressed · ${listed.entries.length} entries${listed.skipped.length ? ` · skipped ${listed.skipped.length}` : ""}`,
      );
    } catch (e) {
      setError(errMsg(e));
    }
  }

  useEffect(() => {
    if (typeof payload?.path === "string") void load(payload.path);
  }, [payload?.path]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar>
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{info}</span>
        {path ? (
          <GhostBtn
            onClick={async () => {
              try {
                await zipExtractFn({ data: { path, dest: "/Home/Downloads" } });
                setStatus("Extract queued. Check System Monitor for progress, then open Files → Downloads.");
              } catch (e) {
                setError(errMsg(e));
              }
            }}
          >
            Extract to Downloads
          </GhostBtn>
        ) : null}
      </Toolbar>
      {error ? <p className="px-3 text-sm text-rose-300">{error}</p> : null}
      {status ? <p className="px-3 text-sm text-emerald-300">{status}</p> : null}
      <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
        {!entries.length ? <Empty title="Archives" body="Open a .zip from Files. Listing reads the stored archive; extract runs as a job." /> : null}
        {entries.map((e) => (
          <div key={e.path} className="flex justify-between border-b border-white/5 py-1">
            <span className="truncate">{e.isDir ? `${e.path}/` : e.path}</span>
            <span className="text-xs text-faint">{e.isDir ? "folder" : `${e.size} B`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MediaApp({ payload }: { payload?: { path?: string } }) {
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState("video/mp4");
  useEffect(() => {
    const path = typeof payload?.path === "string" ? payload.path : null;
    if (!path) return;
    void readFileFn({ data: { path } }).then((raw) => {
      const f = decode<FilePayload>(raw);
      const blob = f.encoding === "base64" ? b64blob(f.content, f.mimeType || "application/octet-stream") : new Blob([f.content]);
      setMime(f.mimeType || "video/mp4");
      setUrl(URL.createObjectURL(blob));
    });
  }, [payload?.path]);
  if (!url) return <Empty title="Media" body="Open an audio or video file from Files." />;
  if (mime.startsWith("audio/")) return <div className="grid h-full place-items-center p-6"><audio src={url} controls className="w-full" /></div>;
  return (
    <div className="grid h-full place-items-center bg-black">
      <video src={url} controls className="max-h-full max-w-full" />
    </div>
  );
}

export function BrowserApp() {
  const [url, setUrl] = useState("https://docs.x.ai");
  const [loaded, setLoaded] = useState(url);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="flex gap-2 border-b border-white/10 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          let next = url.trim();
          if (!/^https?:\/\//i.test(next)) next = "https://" + next;
          setLoaded(next);
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
        />
        <GhostBtn type="submit">Go</GhostBtn>
      </form>
      <p className="px-3 py-1 text-[11px] text-faint">
        Atlas is sandboxed. Many sites block embedding; that is a browser security rule, not a Trosmos bug.
      </p>
      <iframe title="Atlas" src={loaded} sandbox="allow-scripts allow-same-origin allow-forms" className="min-h-0 flex-1 bg-white" />
    </div>
  );
}

export function SearchApp() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<{ id: string; kind: string; title: string; subtitle?: string; path?: string }>>([]);
  const [hist, setHist] = useState<Array<{ query: string }>>([]);
  useEffect(() => {
    void searchHistoryFn().then((h) => setHist(h as typeof hist));
  }, []);
  return (
    <div className="flex h-full flex-col p-3">
      <input
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter" && q.trim()) {
            const res = decode<{ results: typeof hits }>(await searchFn({ data: { query: q } }), { results: [] });
            setHits(res.results);
          }
        }}
        placeholder="Search files, notes, tasks, apps…"
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
      />
      <div className="mt-3 min-h-0 flex-1 overflow-auto space-y-1">
        {hits.map((h) => (
          <button
            key={h.kind + h.id}
            type="button"
            className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/8"
            onClick={() => {
              if (h.kind === "app") useOs.getState().openApp(h.id);
              else if (h.kind === "note") useOs.getState().openApp("notes", { noteId: h.id });
              else if (h.kind === "task") useOs.getState().openApp("tasks", { taskId: h.id });
              else if (h.kind === "event") useOs.getState().openApp("calendar", { eventId: h.id });
              else if (h.kind === "setting") useOs.getState().openApp("settings");
              else if (h.path) useOs.getState().openApp("files", { path: h.path });
            }}
          >
            <div className="text-xs uppercase text-faint">{h.kind}</div>
            <div>{h.title}</div>
            {h.subtitle ? <div className="text-xs text-muted">{h.subtitle}</div> : null}
          </button>
        ))}
        {!hits.length ? (
          <div className="text-xs text-muted">
            Recent: {hist.map((h) => h.query).join(" · ") || "none yet"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MonitorApp() {
  const [stats, setStats] = useState<{ used: number; limit: number; files: number } | null>(null);
  const [jobs, setJobs] = useState<Array<{ id: string; title: string; status: string; progress: number; error: string | null }>>([]);
  const [mem, setMem] = useState<number | null>(null);
  async function refresh() {
    setStats(decode<{ used: number; limit: number; files: number }>(await statsFn()));
    setJobs((await listJobsFn()) as typeof jobs);
    const anyPerf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    setMem(anyPerf.memory?.usedJSHeapSize ?? null);
  }
  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(t);
  }, []);
  const pct = stats ? Math.min(100, Math.round((stats.used / stats.limit) * 100)) : 0;
  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <h2 className="font-display text-xl">System Monitor</h2>
      <div>
        <div className="mb-1 text-sm text-muted">Storage {pct}%</div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-faint">
          {stats?.used} / {stats?.limit} bytes · {stats?.files} files
        </p>
      </div>
      {mem != null ? <p className="text-sm text-muted">JS heap {(mem / 1048576).toFixed(1)} MB (browser-reported)</p> : null}
      <div className="flex gap-2">
        <GhostBtn onClick={() => void enqueueJobFn({ data: { type: "inspect_folder", title: "Inspect Home", payload: { path: "/Home" } } }).then(refresh)}>
          Queue inspect
        </GhostBtn>
        <GhostBtn onClick={() => void refresh()}>Refresh</GhostBtn>
      </div>
      <div className="space-y-2">
        {jobs.map((j) => (
          <div key={j.id} className="rounded-xl bg-white/5 p-2 text-sm">
            <div className="flex justify-between">
              <span>{j.title}</span>
              <span className="text-muted">{j.status}</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-white/10">
              <div className="h-full bg-emerald-400" style={{ width: `${Math.round((j.progress || 0) * 100)}%` }} />
            </div>
            {j.status === "pending" || j.status === "running" ? (
              <GhostBtn onClick={() => void cancelJobFn({ data: { id: j.id } }).then(refresh)}>Cancel</GhostBtn>
            ) : null}
            {j.error ? <p className="text-xs text-rose-300">{j.error}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActivityApp() {
  const [data, setData] = useState<{
    recent?: Array<{ title: string; path: string; kind?: string; ref?: string; accessed_at: string }>;
    audit?: Array<{ action: string; created_at: string; resource?: string }>;
  } | null>(null);
  useEffect(() => {
    void activityFn().then((d) => setData(d as NonNullable<typeof data>));
  }, []);
  return (
    <div className="h-full overflow-auto p-4 space-y-3 text-sm">
      <h2 className="font-display text-xl">Activity</h2>
      {(data?.recent as Array<{ title: string; path: string; kind?: string; ref?: string; accessed_at: string }> | undefined)?.map((r, i) => (
        <button
          key={i}
          type="button"
          className="block w-full rounded-lg px-2 py-1 text-left text-muted hover:bg-white/8"
          onClick={() => {
            if (r.kind === "note" && r.ref) useOs.getState().openApp("notes", { noteId: r.ref });
            else if (r.kind === "task" && r.ref) useOs.getState().openApp("tasks", { taskId: r.ref });
            else if (r.path) useOs.getState().openApp("files", { path: r.path });
          }}
        >
          {r.title} · {r.path}
        </button>
      ))}
      <h3 className="pt-2 font-medium">Audit</h3>
      {(data?.audit as Array<{ action: string; created_at: string; resource?: string }> | undefined)?.map((a, i) => (
        <div key={i} className="text-xs text-faint">
          {a.action} · {new Date(a.created_at).toLocaleString()}
          {a.resource ? ` · ${a.resource}` : ""}
        </div>
      ))}
    </div>
  );
}

export function WorkspacesApp() {
  const [list, setList] = useState<Array<{ id: string; name: string; is_active: boolean | string; color: string | null }>>([]);
  async function refresh() {
    setList((await workspacesFn()) as typeof list);
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <Toolbar>
        <GhostBtn
          onClick={async () => {
            const name = window.prompt("Workspace name", "Studio");
            if (!name) return;
            await createWorkspaceFn({ data: { name } });
            await refresh();
          }}
        >
          New
        </GhostBtn>
      </Toolbar>
      {list.map((w) => (
        <div key={w.id} className="flex items-center justify-between rounded-xl bg-white/5 p-3">
          <div>
            <div className="font-medium">{w.name}</div>
            <div className="text-xs text-muted">{w.is_active === true || w.is_active === "t" ? "Active" : ""}</div>
          </div>
          <div className="flex gap-2">
            <GhostBtn
              onClick={async () => {
                await switchWorkspaceFn({ data: { id: w.id } });
                useOs.getState().setWorkspace(w.id);
                const [layout, desk] = await Promise.all([
                  loadLayoutFn({ data: { workspaceId: w.id } }),
                  loadDesktopFn({ data: { workspaceId: w.id } }).catch(() => null),
                ]);
                if (Array.isArray(layout) && layout.length) useOs.getState().hydrateLayout(layout as never);
                else useOs.getState().hydrateLayout([]);
                if (desk) {
                  const d = decode<{ icons?: unknown[]; dock?: string[] | null; wallpaper?: string | null }>(desk);
                  if (d.icons?.length) useOs.getState().setIcons(d.icons as never);
                  if (d.dock?.length) useOs.getState().setDock(d.dock);
                  useOs.getState().setWallpaperOverride(d.wallpaper ?? null);
                }
                await refresh();
              }}
            >
              Switch
            </GhostBtn>
            <GhostBtn
              danger
              onClick={async () => {
                await deleteWorkspaceFn({ data: { id: w.id } });
                await refresh();
              }}
            >
              Delete
            </GhostBtn>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppsLibrary() {
  const [apps, setApps] = useState<
    Array<{
      id: string;
      name: string;
      icon: string;
      category: string;
      offline: string;
      description: string;
      enabled: boolean;
    }>
  >([]);
  useEffect(() => {
    void listAppsFn().then((rows) => setApps(decode(rows, [])));
  }, []);
  return (
    <div className="h-full overflow-auto p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {apps.map((a) => (
        <article key={a.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <AppGlyph id={a.id} icon={a.icon} size={16} />
            <div>
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-muted">{a.category} · {a.offline}</div>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted">{a.description}</p>
          <div className="mt-2 flex gap-2">
            <GhostBtn onClick={() => useOs.getState().openApp(a.id)}>Open</GhostBtn>
            <GhostBtn
              onClick={async () => {
                setApps(decode(await setAppEnabledFn({ data: { appId: a.id, enabled: !a.enabled } }), []));
              }}
            >
              {a.enabled ? "Disable" : "Enable"}
            </GhostBtn>
          </div>
        </article>
      ))}
    </div>
  );
}

export function DeveloperApp() {
  const [path, setPath] = useState("/Home");
  const [out, setOut] = useState("");
  return (
    <div className="flex h-full flex-col p-3">
      <Toolbar>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
        />
        <GhostBtn
          onClick={async () => {
            const items = await listDirFn({ data: { path } });
            setOut(JSON.stringify(items, null, 2));
          }}
        >
          List
        </GhostBtn>
      </Toolbar>
      <pre className="min-h-0 flex-1 overflow-auto p-2 text-xs text-muted">{out || "Inspect a directory JSON payload."}</pre>
      <p className="text-[11px] text-faint">Capabilities are enforced on the server. Client calls without a session fail closed.</p>
    </div>
  );
}

function b64blob(b64: string, mime: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
