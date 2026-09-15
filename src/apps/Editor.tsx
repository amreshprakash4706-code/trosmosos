import { useEffect, useMemo, useRef, useState } from "react";
import { readFileFn, writeFileFn, createFileFn, listDirFn } from "@/lib/trosmos/api";
import { Empty, GhostBtn, Toolbar, errMsg } from "./ui";

type Tab = { path: string; name: string; content: string; original: string; dirty: boolean };

export function EditorApp({ payload }: { payload?: { path?: string } }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [wrap, setWrap] = useState(true);
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const area = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof payload?.path === "string") void openPath(payload.path);
  }, [payload?.path]);

  async function openPath(path: string) {
    try {
      const file = await readFileFn({ data: { path } });
      if (file.encoding === "base64") {
        setError("This looks like a binary file. Open it in Photos, Viewer, or Media instead.");
        return;
      }
      const tab: Tab = {
        path: file.path,
        name: file.name,
        content: file.content,
        original: file.content,
        dirty: false,
      };
      setTabs((t) => {
        const rest = t.filter((x) => x.path !== tab.path);
        return [...rest, tab];
      });
      setActive(file.path);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const tab = tabs.find((t) => t.path === active) || null;
  const lines = useMemo(() => (tab ? tab.content.split("\n").length : 1), [tab]);

  function update(content: string) {
    if (!tab) return;
    setTabs((all) =>
      all.map((t) => (t.path === tab.path ? { ...t, content, dirty: content !== t.original } : t)),
    );
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void save(tab.path, content);
    }, 1200);
  }

  async function save(path?: string, content?: string) {
    const t = tabs.find((x) => x.path === (path || active));
    const body = content ?? t?.content;
    if (!t || body == null) return;
    try {
      await writeFileFn({ data: { path: t.path, content: body } });
      setTabs((all) => all.map((x) => (x.path === t.path ? { ...x, original: body, dirty: false } : x)));
      setStatus(`Saved ${t.name} · ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function newUntitled() {
    const name = window.prompt("File name", "untitled.md");
    if (!name) return;
    try {
      const node = await createFileFn({ data: { parent: "/Home/Documents", name, content: "" } });
      await openPath(node.path);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  function replaceAll() {
    if (!tab || !find) return;
    update(tab.content.split(find).join(repl));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar>
        <GhostBtn onClick={() => void newUntitled()}>New</GhostBtn>
        <GhostBtn
          onClick={async () => {
            const list = await listDirFn({ data: { path: "/Home/Documents" } });
            const pick = list.find((n) => !n.isDir);
            if (pick) await openPath(pick.path);
          }}
        >
          Open Documents
        </GhostBtn>
        <GhostBtn onClick={() => void save()} disabled={!tab?.dirty}>
          Save
        </GhostBtn>
        <GhostBtn onClick={() => setWrap((w) => !w)}>{wrap ? "Unwrap" : "Wrap"}</GhostBtn>
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="Find"
          className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
        />
        <input
          value={repl}
          onChange={(e) => setRepl(e.target.value)}
          placeholder="Replace"
          className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
        />
        <GhostBtn onClick={replaceAll}>Replace all</GhostBtn>
        <span className="ml-auto text-xs text-faint">{status}</span>
      </Toolbar>
      <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-2">
        {tabs.map((t) => (
          <button
            key={t.path}
            type="button"
            onClick={() => setActive(t.path)}
            className={`rounded-t-lg px-3 py-1.5 text-sm ${t.path === active ? "bg-white/10" : "text-muted"}`}
          >
            {t.name}
            {t.dirty ? " •" : ""}
          </button>
        ))}
      </div>
      {error ? <p className="px-3 py-1 text-sm text-rose-300">{error}</p> : null}
      {!tab ? (
        <Empty title="No file open" body="Open a file from Files, or create a new one in Documents." action={<GhostBtn onClick={() => void newUntitled()}>New file</GhostBtn>} />
      ) : (
        <div className="flex min-h-0 flex-1 font-mono text-[13px] leading-5">
          <div className="select-none border-r border-white/10 bg-black/20 px-2 py-3 text-right text-faint">
            {Array.from({ length: lines }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <textarea
            ref={area}
            value={tab.content}
            onChange={(e) => update(e.target.value)}
            spellCheck={false}
            wrap={wrap ? "soft" : "off"}
            className="h-full min-h-0 flex-1 resize-none bg-transparent p-3 text-fg outline-none"
            aria-label={`Editor ${tab.name}`}
          />
        </div>
      )}
    </div>
  );
}
