import { useEffect, useMemo, useRef, useState } from "react";
import { listDirFn, readFileFn, writeFileFn, createFileFn, decode } from "@/lib/trosmos/api";
import { findMatches, highlight, langFromName, replaceMatches } from "@/lib/trosmos/highlight";
import { Empty, GhostBtn, Toolbar, errMsg } from "./ui";

type Tab = { path: string; name: string; content: string; original: string; dirty: boolean };

export function EditorApp({ payload }: { payload?: { path?: string } }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [wrap, setWrap] = useState(true);
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [findIdx, setFindIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [picker, setPicker] = useState<Array<{ path: string; name: string }> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const overlay = useRef<HTMLPreElement>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof payload?.path === "string") void openPath(payload.path);
  }, [payload?.path]);

  async function openPath(path: string) {
    try {
      const file = decode<{ path: string; name: string; content: string; encoding?: string }>(await readFileFn({ data: { path } }));
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
      setTabs((t) => [...t.filter((x) => x.path !== tab.path), tab]);
      setActive(file.path);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const tab = tabs.find((t) => t.path === active) || null;
  const lang = tab ? langFromName(tab.name) : "plain";
  const lines = useMemo(() => (tab ? tab.content.split("\n").length : 1), [tab]);
  const matches = useMemo(() => (tab && find ? findMatches(tab.content, find) : []), [tab, find]);

  function update(content: string) {
    if (!tab) return;
    setTabs((all) => all.map((t) => (t.path === tab.path ? { ...t, content, dirty: content !== t.original } : t)));
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
      const node = decode<{ path: string }>(await createFileFn({ data: { parent: "/Home/Documents", name, content: "" } }));
      await openPath(node.path);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  function gotoMatch(dir: number) {
    if (!matches.length || !area.current) return;
    const next = (findIdx + dir + matches.length) % matches.length;
    setFindIdx(next);
    const i = matches[next];
    area.current.focus();
    area.current.setSelectionRange(i, i + find.length);
  }

  function replaceOne() {
    if (!tab || !find) return;
    const out = replaceMatches(tab.content, find, repl, { all: false });
    update(out.next);
    setStatus(`Replaced ${out.count}`);
  }

  function replaceAll() {
    if (!tab || !find) return;
    const out = replaceMatches(tab.content, find, repl, { all: true });
    update(out.next);
    setStatus(`Replaced ${out.count}`);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        document.getElementById("editor-find")?.focus();
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
            const list = decode<Array<{ path: string; name: string; isDir: boolean }>>(
              await listDirFn({ data: { path: "/Home/Documents" } }),
              [],
            );
            setPicker(list.filter((n) => !n.isDir).map((n) => ({ path: n.path, name: n.name })));
          }}
        >
          Open Documents
        </GhostBtn>
        <GhostBtn onClick={() => void save()} disabled={!tab?.dirty}>
          Save
        </GhostBtn>
        <GhostBtn onClick={() => setWrap((w) => !w)}>{wrap ? "Unwrap" : "Wrap"}</GhostBtn>
        <input
          id="editor-find"
          value={find}
          onChange={(e) => {
            setFind(e.target.value);
            setFindIdx(0);
          }}
          placeholder="Find"
          className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
        />
        <GhostBtn onClick={() => gotoMatch(1)}>Next {matches.length ? `${findIdx + 1}/${matches.length}` : ""}</GhostBtn>
        <GhostBtn onClick={() => gotoMatch(-1)}>Prev</GhostBtn>
        <input
          value={repl}
          onChange={(e) => setRepl(e.target.value)}
          placeholder="Replace"
          className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
        />
        <GhostBtn onClick={replaceOne}>Replace</GhostBtn>
        <GhostBtn onClick={replaceAll}>Replace all</GhostBtn>
        <span className="ml-auto text-xs text-faint">
          {lang} · {lines} lines · {status}
        </span>
      </Toolbar>
      <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-2">
        {tabs.map((t) => (
          <div key={t.path} className={`flex items-center rounded-t-lg ${t.path === active ? "bg-white/10" : "text-muted"}`}>
            <button type="button" onClick={() => setActive(t.path)} className="px-3 py-1.5 text-sm">
              {t.name}
              {t.dirty ? " •" : ""}
            </button>
            <button
              type="button"
              aria-label={`Close ${t.name}`}
              className="pr-2 text-faint"
              onClick={() => {
                setTabs((all) => all.filter((x) => x.path !== t.path));
                if (active === t.path) setActive(tabs.find((x) => x.path !== t.path)?.path || null);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {picker ? (
        <div className="border-b border-white/10 p-2 text-sm">
          {picker.map((p) => (
            <button
              key={p.path}
              type="button"
              className="mr-2 rounded-lg bg-white/8 px-2 py-1"
              onClick={() => {
                void openPath(p.path);
                setPicker(null);
              }}
            >
              {p.name}
            </button>
          ))}
          <GhostBtn onClick={() => setPicker(null)}>Close</GhostBtn>
        </div>
      ) : null}
      {error ? <p className="px-3 py-1 text-sm text-rose-300">{error}</p> : null}
      {!tab ? (
        <Empty
          title="No file open"
          body="Open a file from Files, or create a new one in Documents."
          action={<GhostBtn onClick={() => void newUntitled()}>New file</GhostBtn>}
        />
      ) : (
        <div className="flex min-h-0 flex-1 font-mono text-[13px] leading-5">
          <div className="select-none border-r border-white/10 bg-black/20 px-2 py-3 text-right text-faint">
            {Array.from({ length: lines }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <div className="relative min-h-0 min-w-0 flex-1">
            <pre
              ref={overlay}
              aria-hidden
              className={`editor-overlay pointer-events-none absolute inset-0 overflow-auto p-3 text-[13px] leading-5 ${wrap ? "wrap" : ""}`}
              dangerouslySetInnerHTML={{ __html: highlight(tab.content, lang) + "\n" }}
            />
            <textarea
              ref={area}
              value={tab.content}
              onChange={(e) => update(e.target.value)}
              onScroll={(e) => {
                if (!overlay.current) return;
                overlay.current.scrollTop = e.currentTarget.scrollTop;
                overlay.current.scrollLeft = e.currentTarget.scrollLeft;
              }}
              spellCheck={false}
              wrap={wrap ? "soft" : "off"}
              className={`absolute inset-0 h-full min-h-0 w-full resize-none overflow-auto bg-transparent p-3 text-transparent caret-white outline-none ${wrap ? "" : "whitespace-pre"}`}
              aria-label={`Editor ${tab.name}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
