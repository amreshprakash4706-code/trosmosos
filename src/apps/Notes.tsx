import { useEffect, useState } from "react";
import { createNoteFn, deleteNoteFn, getNoteFn, listNotesFn, updateNoteFn } from "@/lib/trosmos/api";
import { Empty, GhostBtn, Toolbar, errMsg } from "./ui";
import { useOs } from "@/os/store";

type NoteRow = {
  id: string;
  title: string;
  preview: string | null;
  pinned: boolean | string | number;
  updated_at: string;
};

export function NotesApp() {
  const workspaceId = useOs((s) => s.workspaceId);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function refresh() {
    try {
      const rows = (await listNotesFn({ data: { workspaceId } })) as NoteRow[];
      setNotes(rows);
      if (!active && rows[0]) void open(rows[0].id);
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
  }

  async function save() {
    if (!active) return;
    try {
      await updateNoteFn({ data: { id: active, title, content } });
      await refresh();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(t);
  }, [title, content, active]);

  const filtered = notes.filter((n) => n.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-52 shrink-0 flex-col border-r border-white/10">
        <Toolbar>
          <GhostBtn
            onClick={async () => {
              const n = (await createNoteFn({ data: { title: "Untitled", workspaceId } })) as { id: string };
              await refresh();
              await open(n.id);
            }}
          >
            New
          </GhostBtn>
        </Toolbar>
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
              placeholder="Write in markdown…"
            />
          </>
        )}
      </div>
    </div>
  );
}
