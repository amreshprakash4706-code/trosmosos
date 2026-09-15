import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  File as FileIcon,
  FileArchive,
  FileCode,
  FileText,
  Film,
  Folder,
  FolderPlus,
  Grid3x3,
  Image,
  List,
  Music,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import {
  copyFn,
  createFileFn,
  createFolderFn,
  emptyTrashFn,
  favoriteFn,
  listDirFn,
  listFavoritesFn,
  listTrashFn,
  moveFn,
  readFileFn,
  removeFn,
  renameFn,
  restoreFn,
  restoreVersionFn,
  trashFn,
  versionsFn,
} from "@/lib/trosmos/api";
import type { VfsNode } from "@/lib/trosmos/types";
import { useOs } from "@/os/store";
import { Empty, GhostBtn, Toolbar, errMsg } from "./ui";

const SIDE = [
  { path: "/Home", label: "Home" },
  { path: "/Home/Desktop", label: "Desktop" },
  { path: "/Home/Documents", label: "Documents" },
  { path: "/Home/Downloads", label: "Downloads" },
  { path: "/Home/Pictures", label: "Pictures" },
  { path: "/Home/Notes", label: "Notes" },
  { path: "/Home/Projects", label: "Projects" },
];

export function FilesApp({ payload }: { payload?: { path?: string } }) {
  const initial = typeof payload?.path === "string" ? payload.path : "/Home";
  const [path, setPath] = useState(initial);
  const [items, setItems] = useState<VfsNode[]>([]);
  const [trash, setTrash] = useState<VfsNode[]>([]);
  const [favs, setFavs] = useState<Array<{ path: string; title: string | null }>>([]);
  const [mode, setMode] = useState<"files" | "trash">("files");
  const [view, setView] = useState<"grid" | "list">("list");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof versionsFn>> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "trash") {
        setTrash(await listTrashFn());
      } else {
        setItems(await listDirFn({ data: { path, sort, q } }));
      }
      setFavs(await listFavoritesFn());
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [path, sort, q, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    useOs.getState().setCwd(path);
  }, [path]);

  const crumbs = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    const acc: Array<{ label: string; path: string }> = [{ label: "root", path: "/" }];
    let cur = "";
    for (const p of parts) {
      cur += "/" + p;
      acc.push({ label: p, path: cur });
    }
    return acc;
  }, [path]);

  async function openNode(n: VfsNode) {
    if (n.isDir) {
      setPath(n.path);
      setSelected(null);
      return;
    }
    const mime = n.mimeType || "";
    if (mime.startsWith("image/")) useOs.getState().openApp("photos", { path: n.path });
    else if (mime === "application/pdf") useOs.getState().openApp("viewer", { path: n.path });
    else if (mime.startsWith("audio/") || mime.startsWith("video/"))
      useOs.getState().openApp("media", { path: n.path });
    else if (mime === "application/zip") useOs.getState().openApp("archive", { path: n.path });
    else useOs.getState().openApp("editor", { path: n.path });
  }

  async function newFolder() {
    const name = window.prompt("Folder name");
    if (!name) return;
    try {
      await createFolderFn({ data: { parent: path, name } });
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function newFile() {
    const name = window.prompt("File name", "untitled.md");
    if (!name) return;
    try {
      await createFileFn({ data: { parent: path, name, content: "" } });
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      try {
        const buf = await file.arrayBuffer();
        const isText = file.type.startsWith("text/") || /\.(md|json|txt|js|ts|css|html|svg)$/i.test(file.name);
        if (isText) {
          const content = new TextDecoder().decode(buf);
          await createFileFn({ data: { parent: path, name: file.name, content } });
        } else {
          const bytes = new Uint8Array(buf);
          let bin = "";
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          const content = btoa(bin);
          await createFileFn({
            data: { parent: path, name: file.name, content, encoding: "base64" },
          });
        }
      } catch (e) {
        setError(errMsg(e));
      }
    }
    await load();
  }

  async function download(n: VfsNode) {
    if (n.isDir) return;
    const file = await readFileFn({ data: { path: n.path } });
    const blob =
      file.encoding === "base64"
        ? b64ToBlob(file.content, file.mimeType || "application/octet-stream")
        : new Blob([file.content], { type: file.mimeType || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = n.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAction(action: string, n: VfsNode) {
    try {
      if (action === "open") await openNode(n);
      else if (action === "rename") {
        const name = window.prompt("New name", n.name);
        if (!name) return;
        await renameFn({ data: { path: n.path, name } });
        await load();
      } else if (action === "copy") {
        await copyFn({ data: { path: n.path, destination: path } });
        await load();
      } else if (action === "fav") {
        await favoriteFn({ data: { path: n.path, on: true } });
        await load();
      } else if (action === "trash") {
        await trashFn({ data: { path: n.path } });
        setSelected(null);
        await load();
      } else if (action === "restore") {
        await restoreFn({ data: { path: n.trashPath || n.path } });
        await load();
      }
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const rows = mode === "trash" ? trash : items;

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-44 shrink-0 flex-col border-r border-white/10 p-2 text-sm md:flex">
        {SIDE.map((s) => (
          <button
            key={s.path}
            type="button"
            onClick={() => {
              setMode("files");
              setPath(s.path);
            }}
            className={`rounded-lg px-2 py-1.5 text-left hover:bg-white/10 ${path === s.path && mode === "files" ? "bg-white/10" : "text-muted"}`}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMode("trash")}
          className={`mt-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10 ${mode === "trash" ? "bg-white/10" : "text-muted"}`}
        >
          Trash
        </button>
        <div className="mt-3 px-2 text-[11px] uppercase tracking-wide text-faint">Favorites</div>
        {favs.map((f) => (
          <button
            key={f.path}
            type="button"
            className="truncate rounded-lg px-2 py-1.5 text-left text-muted hover:bg-white/10"
            onClick={() => {
              setMode("files");
              setPath(f.path.includes(".") ? f.path.slice(0, f.path.lastIndexOf("/")) : f.path);
            }}
          >
            {f.title || f.path}
          </button>
        ))}
      </aside>
      <div
        className="flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onUpload(e.dataTransfer.files);
        }}
      >
        <Toolbar>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-muted">
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight size={12} /> : null}
                <button type="button" className="hover:text-fg" onClick={() => setPath(c.path === "/" ? "/Home" : c.path)}>
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter"
            className="w-28 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm md:w-40"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
          >
            <option value="name">Name</option>
            <option value="modified">Modified</option>
            <option value="size">Size</option>
          </select>
          <button type="button" className="rounded-lg p-1.5 hover:bg-white/10" onClick={() => setView(view === "list" ? "grid" : "list")} aria-label="Toggle view">
            {view === "list" ? <Grid3x3 size={15} /> : <List size={15} />}
          </button>
          {mode === "files" ? (
            <>
              <GhostBtn onClick={() => void newFolder()}>
                <span className="inline-flex items-center gap-1">
                  <FolderPlus size={14} /> Folder
                </span>
              </GhostBtn>
              <GhostBtn onClick={() => void newFile()}>New file</GhostBtn>
              <GhostBtn onClick={() => fileRef.current?.click()}>
                <span className="inline-flex items-center gap-1">
                  <Upload size={14} /> Upload
                </span>
              </GhostBtn>
            </>
          ) : (
            <GhostBtn danger onClick={() => void emptyTrashFn().then(load)}>
              Empty trash
            </GhostBtn>
          )}
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void onUpload(e.target.files)} />
        </Toolbar>
        {error ? <p className="px-3 py-2 text-sm text-rose-300">{error}</p> : null}
        {busy && !rows.length ? <Empty title="Loading…" /> : null}
        {!busy && !rows.length ? (
          <Empty title={mode === "trash" ? "Trash is empty" : "This folder is empty"} body="Create a file, upload, or ask Trosmos AI to draft something here." />
        ) : (
          <div className={`flex-1 overflow-auto p-2 ${view === "grid" ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : "space-y-0.5"}`}>
            {rows.map((n) => (
              <button
                key={n.id}
                type="button"
                onDoubleClick={() => void openNode(n)}
                onClick={() => setSelected(n.path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelected(n.path);
                  useOs.getState().setContext({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                      { label: "Open", action: "open" },
                      { label: "Rename", action: "rename" },
                      { label: "Duplicate", action: "copy" },
                      { label: "Favorite", action: "fav" },
                      {
                        label: mode === "trash" ? "Restore" : "Move to Trash",
                        action: mode === "trash" ? "restore" : "trash",
                        danger: mode !== "trash",
                      },
                    ],
                    onAction: (action) => void handleAction(action, n),
                  });
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/8 ${selected === n.path ? "bg-white/10" : ""} ${view === "grid" ? "flex-col py-4" : ""}`}
              >
                <FileGlyph node={n} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{n.name}</span>
                  {view === "list" ? (
                    <span className="block text-[11px] text-faint">
                      {n.isDir ? "Folder" : formatSize(n.size)} · {new Date(n.updatedAt).toLocaleString()}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        )}
        {selected && mode === "files" ? (
          <footer className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2 text-xs text-muted">
            <GhostBtn
              onClick={() => {
                const n = items.find((i) => i.path === selected);
                if (n) void openNode(n);
              }}
            >
              Open
            </GhostBtn>
            <GhostBtn
              onClick={async () => {
                const name = window.prompt("New name");
                if (!name || !selected) return;
                await renameFn({ data: { path: selected, name } });
                await load();
              }}
            >
              Rename
            </GhostBtn>
            <GhostBtn
              onClick={async () => {
                const dest = window.prompt("Move into folder path", "/Home");
                if (!dest || !selected) return;
                await moveFn({ data: { path: selected, destination: dest } });
                await load();
              }}
            >
              Move
            </GhostBtn>
            <GhostBtn
              onClick={async () => {
                if (!selected) return;
                await copyFn({ data: { path: selected, destination: path } });
                await load();
              }}
            >
              Duplicate
            </GhostBtn>
            <GhostBtn
              onClick={async () => {
                if (!selected) return;
                await favoriteFn({ data: { path: selected, on: true } });
                await load();
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Star size={12} /> Favorite
              </span>
            </GhostBtn>
            <GhostBtn
              onClick={async () => {
                const n = items.find((i) => i.path === selected);
                if (n) await download(n);
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Download size={12} /> Download
              </span>
            </GhostBtn>
            <GhostBtn
              onClick={async () => {
                if (!selected) return;
                setVersions(await versionsFn({ data: { path: selected } }));
              }}
            >
              Versions
            </GhostBtn>
            <GhostBtn
              danger
              onClick={async () => {
                if (!selected) return;
                await trashFn({ data: { path: selected } });
                setSelected(null);
                await load();
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Trash2 size={12} /> Trash
              </span>
            </GhostBtn>
          </footer>
        ) : null}
        {selected && mode === "trash" ? (
          <footer className="flex gap-2 border-t border-white/10 px-3 py-2">
            <GhostBtn
              onClick={async () => {
                await restoreFn({ data: { path: selected } });
                await load();
              }}
            >
              Restore
            </GhostBtn>
            <GhostBtn
              danger
              onClick={async () => {
                await removeFn({ data: { path: selected } });
                await load();
              }}
            >
              Delete forever
            </GhostBtn>
          </footer>
        ) : null}
        {versions ? (
          <div className="border-t border-white/10 p-3 text-xs">
            <div className="mb-1 text-muted">Versions of {versions.path}</div>
            {versions.versions.map((v) => (
              <div key={v.version} className="flex items-center justify-between py-0.5">
                <span>
                  v{v.version} {v.current ? "(current)" : ""} · {v.size} bytes
                </span>
                {!v.current ? (
                  <GhostBtn
                    onClick={async () => {
                      await restoreVersionFn({ data: { path: versions.path, version: v.version } });
                      setVersions(await versionsFn({ data: { path: versions.path } }));
                    }}
                  >
                    Restore
                  </GhostBtn>
                ) : null}
              </div>
            ))}
            <GhostBtn onClick={() => setVersions(null)}>Close</GhostBtn>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function FileGlyph({ node }: { node: VfsNode }) {
  const ext = node.name.split(".").pop()?.toLowerCase() || "";
  const Icon = node.isDir
    ? Folder
    : ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)
      ? Image
      : ["mp3", "wav", "ogg"].includes(ext)
        ? Music
        : ["mp4", "webm"].includes(ext)
          ? Film
          : ext === "zip"
            ? FileArchive
            : ["js", "ts", "tsx", "jsx", "json", "py", "go", "rs", "css", "html"].includes(ext)
              ? FileCode
              : ["md", "txt"].includes(ext)
                ? FileText
                : FileIcon;
  return (
    <span className="grid size-8 place-items-center rounded-lg bg-white/8 text-fg">
      <Icon size={16} />
    </span>
  );
}

function b64ToBlob(b64: string, mime: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
