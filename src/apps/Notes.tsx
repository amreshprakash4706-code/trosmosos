import { useEffect, useState } from "react";
import {
  createNoteFn,
  createNoteFolderFn,
  deleteNoteFn,
  deleteNoteFolderFn,
  exportNoteFn,
  getNoteFn,
  listNotesFn,
  moveNoteFn,
  noteFoldersFn,
  noteLinksFn,
  updateNoteFn,
  decode,
} from "@/lib/trosmos/api";
import { extractWikiLinks } from "@/lib/trosmos/wiki";
import { enqueueLocal, isBrowserOnline } from "@/lib/trosmos/offline";
import { Empty, GhostBtn, Toolbar, errMsg } from "./ui";
import { useOs } from "@/os/store";

type NoteRow = {
  id: string;
  title: string;
  preview: string | null;
  pinned: boolean | string | number;
  folder_id?: string | null;
  updated_at: string;
};

type FolderRow = { id: string; name: string; path: string; parent_id: string | null };

export function NotesApp({ payload }: { payload?: { noteId?: string } }) {
  const workspaceId = useOs((s) => s.workspaceId);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [links, setLinks] = useState<{ backlinks: Array<{ id: string; title: string }>; outgoing: Array<{ title: string; noteId: string | null }> }>({
    backlinks: [],
    outgoing: [],
  });

  async function refresh() {
    try {
      const rows = (await listNotesFn({ data: { workspaceId } })) as NoteRow[];
      setNotes(rows);
      setFolders((await noteFoldersFn()) as FolderRow[]);
      if (payload?.noteId) void open(payload.noteId);
      else if (!active && rows[0]) void open(rows[0].id);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, [workspaceId]);

  async function open(id: string) {
    const n = (await getNoteFn({ data: { id } })) as { id: string; title: string; content: string };
    setActive(n.id);
    setTitle(n.title);
    setContent(n.content);
    try {
      setLinks((await noteLinksFn({ data: { id } })) as typeof links);
    } catch {
      setLinks({ backlinks: [], outgoing: [] });
    }
  }

  async function save() {
    if (!active) return;
    try {
      if (!isBrowserOnline()) {
        await enqueueLocal("note.update", { id: active, title, content });
        return;
      }
      await updateNoteFn({ data: { id: active, title, content } });
      await refresh();
      setLinks((await noteLinksFn({ data: { id: active } })) as typeof links);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(t);
  }, [title, content, active]);

  const filtered = notes.filter((n) => {
    if (folderId && n.folder_id !== folderId) return false;
    return n.title.toLowerCase().includes(q.toLowerCase());
  });
  const wiki = extractWikiLinks(content);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-52 shrink-0 flex-col border-r border-white/10">
        <Toolbar>
          <GhostBtn
            onClick={async () => {
              const n = (await createNoteFn({ data: { title: "Untitled", workspaceId } })) as { id: string };
              if (folderId) await moveNoteFn({ data: { id: n.id, folderId } });
              await refresh();
              await open(n.id);
            }}
          >
            New
          </GhostBtn>
          <GhostBtn
            onClick={async () => {
              const name = window.prompt("Folder name");
              if (!name) return;
              await createNoteFolderFn({ data: { name, parentId: folderId } });
              await refresh();
            }}
          >
            Folder
          </GhostBtn>
        </Toolbar>
        <div className="border-b border-white/10 px-2 py-1">
          <button
            type="button"
            className={`block w-full rounded-lg px-2 py-1 text-left text-xs ${!folderId ? "bg-white/10" : "text-muted"}`}
            onClick={() => setFolderId(null)}
          >
            All notes
          </button>
          {folders.map((f) => (
            <div key={f.id} className="flex items-center">
              <button
                type="button"
                className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-left text-xs ${folderId === f.id ? "bg-white/10" : "text-muted"}`}
                onClick={() => setFolderId(f.id)}
              >
                {f.path}
              </button>
              <button
                type="button"
                className="px-1 text-[10px] text-rose-300"
                onClick={async () => {
                  await deleteNoteFolderFn({ data: { id: f.id } });
                  if (folderId === f.id) setFolderId(null);
                  await refresh();
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter notes"
          className="m-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
        />
        <div className="min-h-0 flex-1 overflow-auto">
          {filtered.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void open(n.id)}
              className={`block w-full px-3 py-2 text-left hover:bg-white/8 ${active === n.id ? "bg-white/10" : ""}`}
            >
              <div className="truncate text-sm">{n.title}</div>
              <div className="truncate text-[11px] text-faint">{n.preview}</div>
            </button>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {error ? <p className="px-3 text-sm text-rose-300">{error}</p> : null}
        {!active ? (
          <Empty title="No note selected" body="Create a note to start writing." />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-w-0 flex-1 bg-transparent font-display text-lg outline-none"
              />
              <select
                value={folderId || ""}
                onChange={async (e) => {
                  const id = e.target.value || null;
                  if (active) await moveNoteFn({ data: { id: active, folderId: id } });
                  setFolderId(id);
                  await refresh();
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs"
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <GhostBtn
                onClick={async () => {
                  if (!active) return;
                  await updateNoteFn({ data: { id: active, pinned: true } });
                  await refresh();
                }}
              >
                Pin
              </GhostBtn>
              <GhostBtn
                onClick={async () => {
                  if (!active) return;
                  const out = decode<{ path: string }>(await exportNoteFn({ data: { id: active } }));
                  useOs.getState().openApp("editor", { path: out.path });
                }}
              >
                Export md
              </GhostBtn>
              <GhostBtn
                danger
                onClick={async () => {
                  if (!active) return;
                  await deleteNoteFn({ data: { id: active } });
                  setActive(null);
                  await refresh();
                }}
              >
                Delete
              </GhostBtn>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-0 flex-1 resize-none bg-transparent p-4 outline-none"
              placeholder="Write in markdown. Link notes with [[Title]]."
            />
            <div className="border-t border-white/10 px-3 py-2 text-xs">
              <div className="mb-1 text-muted">Wiki links</div>
              <div className="flex flex-wrap gap-1">
                {wiki.map((t) => {
                  const hit = notes.find((n) => n.title.toLowerCase() === t.toLowerCase());
                  return (
                    <button
                      key={t}
                      type="button"
                      className="rounded bg-white/10 px-1.5 py-0.5"
                      onClick={async () => {
                        if (hit) {
                          void open(hit.id);
                          return;
                        }
                        const n = (await createNoteFn({ data: { title: t, workspaceId, content: `# ${t}\n` } })) as {
                          id: string;
                        };
                        await refresh();
                        await open(n.id);
                      }}
                    >
                      [[{t}]]{hit ? "" : " (missing)"}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-muted">Backlinks</div>
              {links.backlinks.map((b) => (
                <button key={b.id} type="button" className="mr-2 text-cyan-200" onClick={() => void open(b.id)}>
                  {b.title}
                </button>
              ))}
              {!links.backlinks.length ? <span className="text-faint">None yet</span> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
