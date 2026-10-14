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
  addCommentFn,
  bulkCopyFn,
  bulkMoveFn,
  bulkTagFn,
  bulkTrashFn,
  copyFn,
  createFileFn,
  createFolderFn,
  createShareFn,
  emptyTrashFn,
  favoriteFn,
  filesByTagFn,
  listCommentsFn,
  deleteCommentFn,
  listDirFn,
  listFavoritesFn,
  listSharesFn,
  listTagsFn,
  listTrashFn,
  readFileFn,
  recentFn,
  removeFn,
  renameFn,
  restoreFn,
  restoreVersionFn,
  revokeShareFn,
  resolveShareFn,
  setTagsFn,
  thumbnailFn,
  trashFn,
  versionsFn,
  zipCreateFn,
  zipExtractFn,
  decode,
} from "@/lib/trosmos/api";
import type { FileComment, ShareGrant, VfsNode } from "@/lib/trosmos/types";
import { enqueueLocal, isBrowserOnline } from "@/lib/trosmos/offline";
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

type ConflictPolicy = "overwrite" | "rename" | "skip";
type VersionSet = {
  path: string;
  versions: Array<{ version: number; current?: boolean; size: number }>;
};

export function FilesApp({ payload }: { payload?: { path?: string } }) {
  const initial = typeof payload?.path === "string" ? payload.path : "/Home";
  const [path, setPath] = useState(initial);
  const [pathEdit, setPathEdit] = useState(false);
  const [pathDraft, setPathDraft] = useState(initial);
  const [items, setItems] = useState<VfsNode[]>([]);
  const [splitItems, setSplitItems] = useState<VfsNode[] | null>(null);
  const [splitPath, setSplitPath] = useState("/Home/Documents");
  const [trash, setTrash] = useState<VfsNode[]>([]);
  const [favs, setFavs] = useState<Array<{ path: string; title: string | null }>>([]);
  const [recents, setRecents] = useState<Array<{ title: string; path: string }>>([]);
  const [mode, setMode] = useState<"files" | "trash">("files");
  const [view, setView] = useState<"grid" | "list">("list");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [versions, setVersions] = useState<VersionSet | null>(null);
  const [inspector, setInspector] = useState<"none" | "tags" | "comments" | "share">("none");
  const [comments, setComments] = useState<FileComment[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [shares, setShares] = useState<ShareGrant[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [conflict, setConflict] = useState<ConflictPolicy>("rename");
  const [shareToken, setShareToken] = useState("");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "trash") {
        setTrash(decode<VfsNode[]>(await listTrashFn(), []));
      } else {
        setItems(decode<VfsNode[]>(await listDirFn({ data: { path, sort, q } }), []));
      }
      setFavs(decode<Array<{ path: string; title: string | null }>>(await listFavoritesFn(), []));
      setRecents(decode<typeof recents>(await recentFn(), []));
      setAllTags(decode<typeof allTags>(await listTagsFn({ data: {} }), []));
      setShares(decode<ShareGrant[]>(await listSharesFn(), []));
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
    setPathDraft(path);
  }, [path]);

  useEffect(() => {
    if (typeof payload?.path === "string") setPath(payload.path);
  }, [payload?.path]);

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

  const rows = mode === "trash" ? trash : items;
  const selectedNodes = rows.filter((n) => selected.includes(n.path));
  const primary = selectedNodes[0] || null;

  useEffect(() => {
    if (!primary || inspector === "none") return;
    void (async () => {
      try {
        if (inspector === "comments") setComments(decode<FileComment[]>(await listCommentsFn({ data: { path: primary.path } }), []));
        if (inspector === "tags") setTags(decode<string[]>(await listTagsFn({ data: { path: primary.path } }), []));
      } catch (e) {
        setError(errMsg(e));
      }
    })();
  }, [primary?.path, inspector]);

  useEffect(() => {
    const images = items.filter((n) => !n.isDir && /\.(png|jpe?g|gif|webp|svg)$/i.test(n.name)).slice(0, 12);
    void Promise.all(
      images.map(async (n) => {
        try {
          const t = decode<{ dataUrl: string }>(await thumbnailFn({ data: { path: n.path } }));
          const small = await downscaleThumb(t.dataUrl);
          setThumbs((prev) => ({ ...prev, [n.path]: small }));
        } catch {
          /* not an image or too large */
        }
      }),
    );
  }, [items]);

  async function openNode(n: VfsNode) {
    if (n.isDir) {
      setPath(n.path);
      setSelected([]);
      return;
    }
    const mime = n.mimeType || "";
    if (mime.startsWith("image/")) useOs.getState().openApp("photos", { path: n.path });
    else if (mime === "application/pdf") useOs.getState().openApp("viewer", { path: n.path });
    else if (mime.startsWith("audio/") || mime.startsWith("video/"))
      useOs.getState().openApp("media", { path: n.path });
    else if (mime === "application/zip" || n.name.endsWith(".zip")) useOs.getState().openApp("archive", { path: n.path });
    else useOs.getState().openApp("editor", { path: n.path });
  }

  function toggleSelect(n: VfsNode, additive: boolean, range: boolean) {
    if (range && selected[0]) {
      const a = rows.findIndex((r) => r.path === selected[0]);
      const b = rows.findIndex((r) => r.path === n.path);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected(rows.slice(lo, hi + 1).map((r) => r.path));
      return;
    }
    if (additive) {
      setSelected((s) => (s.includes(n.path) ? s.filter((p) => p !== n.path) : [...s, n.path]));
    } else setSelected([n.path]);
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
          await createFileFn({
            data: { parent: path, name: file.name, content: btoa(bin), encoding: "base64" },
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
    const file = decode<{ encoding?: string; content: string; mimeType?: string | null }>(await readFileFn({ data: { path: n.path } }));
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

  async function bulk(action: "trash" | "copy" | "move" | "zip" | "tag") {
    const paths = selected.length ? selected : primary ? [primary.path] : [];
    if (!paths.length) return;
    try {
      if (action === "trash") await bulkTrashFn({ data: { paths } });
      if (action === "copy") {
        const dest = window.prompt("Copy into folder", path) || path;
        await bulkCopyFn({ data: { paths, destination: dest, onConflict: conflict } });
      }
      if (action === "move") {
        const dest = window.prompt("Move into folder", "/Home") || "/Home";
        await bulkMoveFn({ data: { paths, destination: dest, onConflict: conflict } });
      }
      if (action === "zip") {
        await zipCreateFn({ data: { paths, dest: path, name: "archive.zip" } });
      }
      if (action === "tag") {
        const t = window.prompt("Tags (comma-separated)", tagInput);
        if (!t) return;
        await bulkTagFn({ data: { paths, tags: t.split(",").map((x) => x.trim()).filter(Boolean) } });
      }
      setSelected([]);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function handleAction(action: string, n: VfsNode) {
    try {
      if (action === "open") await openNode(n);
      else if (action === "rename") {
        const name = window.prompt("New name", n.name);
        if (!name) return;
        if (!isBrowserOnline()) await enqueueLocal("vfs.rename", { path: n.path, name });
        else await renameFn({ data: { path: n.path, name } });
        await load();
      } else if (action === "copy") {
        await copyFn({ data: { path: n.path, destination: path } });
        await load();
      } else if (action === "fav") {
        if (!isBrowserOnline()) await enqueueLocal("vfs.favorite", { path: n.path, on: true });
        else await favoriteFn({ data: { path: n.path, on: true } });
        await load();
      } else if (action === "share") {
        const share = decode<{ token: string }>(await createShareFn({ data: { path: n.path, title: n.name } }));
        setInspector("share");
        setShares(decode<ShareGrant[]>(await listSharesFn(), []));
        window.prompt("Read-only share token (same Trosmos sign-in required to open)", share.token);
      } else if (action === "zip") {
        if (n.name.endsWith(".zip")) await zipExtractFn({ data: { path: n.path, dest: path } });
        else await zipCreateFn({ data: { paths: [n.path], dest: path, name: `${n.name}.zip` } });
        await load();
      } else if (action === "trash") {
        await trashFn({ data: { path: n.path } });
        setSelected([]);
        await load();
      } else if (action === "restore") {
        await restoreFn({ data: { path: n.trashPath || n.path } });
        await load();
      } else if (action === "desktop") {
        const icons = useOs.getState().desktopIcons;
        const col = 18 + Math.floor(icons.length / 8) * 92;
        const row = 56 + (icons.length % 8) * 92;
        useOs.getState().setIcons([
          ...icons,
          {
            id: `desk_file_${n.id}`,
            appId: n.isDir ? "files" : "editor",
            path: n.path,
            kind: "file",
            x: col,
            y: row,
            label: n.name,
          },
        ]);
      }
    } catch (e) {
      setError(errMsg(e));
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    if (!rows.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(rows.length - 1, cursor + 1);
      setCursor(next);
      setSelected([rows[next].path]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, cursor - 1);
      setCursor(next);
      setSelected([rows[next].path]);
    } else if (e.key === "Enter" && rows[cursor]) {
      void openNode(rows[cursor]);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void bulk("trash");
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelected(rows.map((r) => r.path));
    }
  }

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
        <div className="mt-3 px-2 text-[11px] uppercase tracking-wide text-faint">Recents</div>
        {recents.slice(0, 8).map((r) => (
          <button
            key={r.path}
            type="button"
            className="truncate rounded-lg px-2 py-1.5 text-left text-muted hover:bg-white/10"
            onClick={() => {
              setMode("files");
              setPath(r.path.includes(".") ? r.path.slice(0, r.path.lastIndexOf("/")) : r.path);
            }}
          >
            {r.title || r.path}
          </button>
        ))}
        {Array.isArray(allTags) && allTags.length ? (
          <>
            <div className="mt-3 px-2 text-[11px] uppercase tracking-wide text-faint">Tags</div>
            {allTags.slice(0, 8).map((t) => (
              <button
                key={t.tag}
                type="button"
                className="truncate rounded-lg px-2 py-1.5 text-left text-muted hover:bg-white/10"
                onClick={async () => {
                  setMode("files");
                  setItems(decode<VfsNode[]>(await filesByTagFn({ data: { tag: t.tag } }), []));
                }}
              >
                #{t.tag} · {t.count}
              </button>
            ))}
          </>
        ) : null}
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
          {pathEdit ? (
            <form
              className="min-w-0 flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                setPath(pathDraft.startsWith("/") ? pathDraft : "/" + pathDraft);
                setPathEdit(false);
              }}
            >
              <input
                autoFocus
                value={pathDraft}
                aria-label="Path"
                onChange={(e) => setPathDraft(e.target.value)}
                onBlur={() => setPathEdit(false)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
              />
            </form>
          ) : (
            <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-muted">
              {crumbs.map((c, i) => (
                <span key={c.path} className="flex items-center gap-1">
                  {i > 0 ? <ChevronRight size={12} /> : null}
                  <button
                    type="button"
                    className="hover:text-fg"
                    onClick={() => setPath(c.path === "/" ? "/Home" : c.path)}
                    onDoubleClick={() => setPathEdit(true)}
                  >
                    {c.label}
                  </button>
                </span>
              ))}
              <GhostBtn onClick={() => setPathEdit(true)}>Go to…</GhostBtn>
            </nav>
          )}
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
          <select
            value={conflict}
            onChange={(e) => setConflict(e.target.value as ConflictPolicy)}
            title="When a name already exists"
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
          >
            <option value="rename">Rename on conflict</option>
            <option value="overwrite">Overwrite</option>
            <option value="skip">Skip</option>
          </select>
          <button
            type="button"
            className="rounded-lg p-1.5 hover:bg-white/10"
            onClick={() => setView(view === "list" ? "grid" : "list")}
            aria-label="Toggle view"
          >
            {view === "list" ? <Grid3x3 size={15} /> : <List size={15} />}
          </button>
          <GhostBtn
            onClick={async () => {
              if (splitItems) {
                setSplitItems(null);
                return;
              }
              setSplitItems(decode<VfsNode[]>(await listDirFn({ data: { path: splitPath } }), []));
            }}
          >
            {splitItems ? "Close split" : "Split"}
          </GhostBtn>
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
        <div className="flex gap-2 border-b border-white/10 px-3 py-1 text-[11px]">
          <input
            value={shareToken}
            onChange={(e) => setShareToken(e.target.value)}
            placeholder="Open share token"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1"
          />
          <GhostBtn
            onClick={async () => {
              if (!shareToken.trim()) return;
              try {
                const out = decode<{
                  node: VfsNode;
                  items: VfsNode[];
                  file?: { path: string } | null;
                  readOnly?: boolean;
                }>(await resolveShareFn({ data: { token: shareToken.trim() } }));
                if (out.node.isDir) {
                  setPath(out.node.path);
                  setItems(out.items);
                } else if (out.file) {
                  useOs.getState().openApp("editor", { path: out.node.path });
                }
                if (out.readOnly) setError("Opened a read-only share. You cannot write through this grant.");
              } catch (e) {
                setError(errMsg(e));
              }
            }}
          >
            Open share
          </GhostBtn>
        </div>
        {error ? <p className="px-3 py-2 text-sm text-rose-300">{error}</p> : null}
        {busy && !rows.length ? <Empty title="Loading…" /> : null}
        <div className="flex min-h-0 flex-1">
          <div
            ref={listRef}
            tabIndex={0}
            onKeyDown={onListKey}
            className={`min-h-0 flex-1 overflow-auto p-2 outline-none ${view === "grid" ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : "space-y-0.5"}`}
          >
            {!busy && !rows.length ? (
              <Empty
                title={mode === "trash" ? "Trash is empty" : "This folder is empty"}
                body="Create a file, upload, or ask Trosmos AI to draft something here."
              />
            ) : null}
            {rows.map((n, i) => (
              <button
                key={n.id}
                type="button"
                onDoubleClick={() => void openNode(n)}
                onClick={(e) => {
                  setCursor(i);
                  toggleSelect(n, e.metaKey || e.ctrlKey, e.shiftKey);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!selected.includes(n.path)) setSelected([n.path]);
                  useOs.getState().setContext({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                      { label: "Open", action: "open" },
                      { label: "Rename", action: "rename" },
                      { label: "Duplicate", action: "copy" },
                      { label: "Favorite", action: "fav" },
                      { label: "Share (read-only)", action: "share" },
                      { label: n.name.endsWith(".zip") ? "Extract zip" : "Zip", action: "zip" },
                      { label: "Place on Desktop", action: "desktop" },
                      {
                        label: mode === "trash" ? "Restore" : "Move to Trash",
                        action: mode === "trash" ? "restore" : "trash",
                        danger: mode !== "trash",
                      },
                    ],
                    onAction: (action) => void handleAction(action, n),
                  });
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/8 ${selected.includes(n.path) ? "bg-white/10" : ""} ${view === "grid" ? "flex-col py-4" : ""}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-trosmos-path", n.path);
                  e.dataTransfer.setData("text/plain", n.path);
                  e.dataTransfer.effectAllowed = "copyMove";
                }}
              >
                {thumbs[n.path] ? (
                  <img src={thumbs[n.path]} alt="" className="size-8 rounded-lg object-cover" />
                ) : (
                  <FileGlyph node={n} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{n.name}</span>
                  {view === "list" ? (
                    <span className="block text-[11px] text-faint">
                      {n.isDir ? "Folder" : formatSize(n.size)} · {new Date(n.updatedAt).toLocaleString()}
                      {n.tags?.length ? ` · ${n.tags.map((t) => `#${t}`).join(" ")}` : ""}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          {splitItems ? (
            <div className="w-1/2 min-w-0 overflow-auto border-l border-white/10 p-2">
              <div className="mb-2 flex gap-2">
                <input
                  value={splitPath}
                  onChange={(e) => setSplitPath(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs"
                />
                <GhostBtn onClick={() => void listDirFn({ data: { path: splitPath } }).then((rows) => setSplitItems(decode<VfsNode[]>(rows, [])))}>Go</GhostBtn>
              </div>
              {splitItems.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="block w-full truncate rounded-lg px-2 py-1 text-left text-sm hover:bg-white/8"
                  onDoubleClick={() => void openNode(n)}
                >
                  {n.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {selected.length && mode === "files" ? (
          <footer className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2 text-xs text-muted">
            <span className="text-faint">{selected.length} selected</span>
            <GhostBtn
              onClick={() => {
                if (primary) void openNode(primary);
              }}
            >
              Open
            </GhostBtn>
            <GhostBtn onClick={() => void bulk("move")}>Move</GhostBtn>
            <GhostBtn onClick={() => void bulk("copy")}>Copy</GhostBtn>
            <GhostBtn onClick={() => void bulk("zip")}>Zip</GhostBtn>
            <GhostBtn onClick={() => void bulk("tag")}>Tag</GhostBtn>
            <GhostBtn onClick={() => setInspector("tags")}>Tags</GhostBtn>
            <GhostBtn onClick={() => setInspector("comments")}>Comments</GhostBtn>
            <GhostBtn onClick={() => setInspector("share")}>Shares</GhostBtn>
            <GhostBtn
              onClick={async () => {
                if (!primary) return;
                await favoriteFn({ data: { path: primary.path, on: true } });
                await load();
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Star size={12} /> Favorite
              </span>
            </GhostBtn>
            <GhostBtn
              onClick={async () => {
                if (primary) await download(primary);
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Download size={12} /> Download
              </span>
            </GhostBtn>
            <GhostBtn
              onClick={async () => {
                if (!primary) return;
                setVersions(decode<VersionSet>(await versionsFn({ data: { path: primary.path } })));
              }}
            >
              Versions
            </GhostBtn>
            <GhostBtn danger onClick={() => void bulk("trash")}>
              <span className="inline-flex items-center gap-1">
                <Trash2 size={12} /> Trash
              </span>
            </GhostBtn>
          </footer>
        ) : null}
        {selected.length && mode === "trash" ? (
          <footer className="flex gap-2 border-t border-white/10 px-3 py-2">
            <GhostBtn
              onClick={async () => {
                for (const p of selected) await restoreFn({ data: { path: p } });
                await load();
              }}
            >
              Restore
            </GhostBtn>
            <GhostBtn
              danger
              onClick={async () => {
                for (const p of selected) await removeFn({ data: { path: p } });
                await load();
              }}
            >
              Delete forever
            </GhostBtn>
          </footer>
        ) : null}
        {inspector !== "none" && primary ? (
          <div className="border-t border-white/10 p-3 text-xs">
            <div className="mb-2 flex justify-between">
              <span className="text-muted">
                {inspector} · {primary.name}
              </span>
              <GhostBtn onClick={() => setInspector("none")}>Close</GhostBtn>
            </div>
            {inspector === "tags" ? (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const next = [...new Set([...tags, ...tagInput.split(",").map((t) => t.trim()).filter(Boolean)])];
                  await setTagsFn({ data: { path: primary.path, tags: next } });
                  setTags(next);
                  setTagInput("");
                  await load();
                }}
              >
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="add tag"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1"
                />
                <GhostBtn type="submit">Save</GhostBtn>
                <div className="flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <span key={t} className="rounded bg-white/10 px-1.5 py-0.5">
                      #{t}
                    </span>
                  ))}
                </div>
              </form>
            ) : null}
            {inspector === "comments" ? (
              <div>
                {comments.map((c) => (
                  <p key={c.id} className="flex items-start justify-between gap-2 py-1">
                    <span>{c.body}</span>
                    <GhostBtn
                      danger
                      onClick={async () => {
                        await deleteCommentFn({ data: { id: c.id } });
                        setComments(decode<FileComment[]>(await listCommentsFn({ data: { path: primary.path } }), []));
                      }}
                    >
                      Delete
                    </GhostBtn>
                  </p>
                ))}
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!commentBody.trim()) return;
                    await addCommentFn({ data: { path: primary.path, body: commentBody } });
                    setCommentBody("");
                    setComments(decode<FileComment[]>(await listCommentsFn({ data: { path: primary.path } }), []));
                  }}
                >
                  <input
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Add a comment"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1"
                  />
                  <GhostBtn type="submit">Add</GhostBtn>
                </form>
              </div>
            ) : null}
            {inspector === "share" ? (
              <div className="space-y-1">
                {shares
                  .filter((s) => s.path === primary.path)
                  .map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2">
                      <code className="truncate text-[11px]">{s.token}</code>
                      <GhostBtn
                        danger
                        onClick={async () => {
                          await revokeShareFn({ data: { id: s.id } });
                          setShares(decode<ShareGrant[]>(await listSharesFn(), []));
                        }}
                      >
                        Revoke
                      </GhostBtn>
                    </div>
                  ))}
                <GhostBtn
                  onClick={async () => {
                    const share = decode<{ token: string }>(await createShareFn({ data: { path: primary.path, title: primary.name } }));
                    setShares(decode<ShareGrant[]>(await listSharesFn(), []));
                    window.prompt("Share token", share.token);
                  }}
                >
                  New read-only grant
                </GhostBtn>
              </div>
            ) : null}
          </div>
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
                      setVersions(decode<VersionSet>(await versionsFn({ data: { path: versions.path } })));
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

function downscaleThumb(dataUrl: string): Promise<string> {
  if (typeof document === "undefined") return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    const img = document.createElement("img");
    img.onload = () => {
      const size = 96;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.max(size / Math.max(1, img.naturalWidth), size / Math.max(1, img.naturalHeight));
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function b64ToBlob(b64: string, mime: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
