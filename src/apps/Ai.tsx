import { useEffect, useRef, useState } from "react";
import {
  aiChatFn,
  aiConfirmFn,
  aiConversationFn,
  aiConversationsFn,
  aiDeleteConvFn,
  aiStatusFn,
  aiUpdateConvFn,
  decode,
} from "@/lib/trosmos/api";
import { Empty, GhostBtn, errMsg } from "./ui";
import { useOs } from "@/os/store";

type Msg = { role: "user" | "assistant"; text: string; pending?: Array<Record<string, unknown>> };
type Convo = { id: string; title: string | null; pinned?: boolean | string | number };

function truthy(v: unknown) {
  return v === true || v === "t" || v === 1 || v === "true";
}

export function AiApp() {
  const [status, setStatus] = useState<{ configured: boolean; model: string } | null>(null);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [cid, setCid] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void aiStatusFn().then(setStatus);
    void aiConversationsFn().then((c) => setConvos(c as Convo[]));
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    setError(null);
    try {
      const res = decode<{
        conversationId: string;
        text: string;
        pending?: Array<Record<string, unknown>>;
      }>(await aiChatFn({ data: { message, conversationId: cid } }));
      setCid(res.conversationId);
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: res.text, pending: res.pending as Array<Record<string, unknown>> },
      ]);
      setConvos((await aiConversationsFn()) as Convo[]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-44 shrink-0 flex-col border-r border-white/10 md:flex">
        <GhostBtn
          onClick={() => {
            setCid(null);
            setMsgs([]);
          }}
        >
          New chat
        </GhostBtn>
        <div className="min-h-0 flex-1 overflow-auto">
          {convos.map((c) => (
            <div key={c.id} className={`flex items-center ${cid === c.id ? "bg-white/10" : ""}`}>
              <button
                type="button"
                onClick={async () => {
                  setCid(c.id);
                  const full = (await aiConversationFn({ data: { id: c.id } })) as {
                    messages: Array<{ role: string; content: string }>;
                  };
                  setMsgs(
                    (full.messages as Array<{ role: string; content: string }>).map((m) => ({
                      role: m.role === "assistant" ? "assistant" : "user",
                      text: m.content,
                    })),
                  );
                }}
                className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm hover:bg-white/8"
              >
                {truthy(c.pinned) ? "📌 " : ""}
                {c.title || "Chat"}
              </button>
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-white/10 px-3 py-2 text-xs text-muted">
          {status?.configured
            ? `Connected · ${status.model} · tools: search, calendar range, task filters, batch files`
            : "AI is unavailable in this environment — the server has no xAI key."}
          {cid ? (
            <span className="ml-2 inline-flex gap-1">
              <GhostBtn
                onClick={async () => {
                  if (!cid) return;
                  const cur = convos.find((c) => c.id === cid);
                  await aiUpdateConvFn({ data: { id: cid, pinned: !truthy(cur?.pinned) } });
                  setConvos((await aiConversationsFn()) as Convo[]);
                }}
              >
                Pin
              </GhostBtn>
              <GhostBtn
                onClick={async () => {
                  if (!cid) return;
                  const name = window.prompt("Conversation name", convos.find((c) => c.id === cid)?.title || "");
                  if (!name) return;
                  await aiUpdateConvFn({ data: { id: cid, title: name } });
                  setConvos((await aiConversationsFn()) as Convo[]);
                }}
              >
                Rename
              </GhostBtn>
              <GhostBtn
                onClick={async () => {
                  if (!cid) return;
                  await aiDeleteConvFn({ data: { id: cid } });
                  setCid(null);
                  setMsgs([]);
                  setConvos((await aiConversationsFn()) as Convo[]);
                }}
              >
                Delete
              </GhostBtn>
            </span>
          ) : null}
        </div>
        <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
          {!msgs.length ? (
            <Empty
              title="Trosmos AI"
              body="Ask to inspect files, draft a note, filter tasks, or search a calendar range. Mutating tools will ask before they run."
            />
          ) : null}
          {msgs.map((m, i) => (
            <article
              key={i}
              className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "ml-auto bg-[var(--accent)]/30" : "bg-white/8"}`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.pending?.map((p) => (
                <div key={String(p.invocationId)} className="mt-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-2">
                  <div className="text-xs text-amber-100">{String(p.summary || p.tool)}</div>
                  <div className="mt-1 flex gap-2">
                    <GhostBtn
                      onClick={async () => {
                        const out = await aiConfirmFn({
                          data: { invocationId: String(p.invocationId), allow: true },
                        });
                        setMsgs((all) => [
                          ...all,
                          { role: "assistant", text: `Confirmed. ${JSON.stringify(out).slice(0, 280)}` },
                        ]);
                      }}
                    >
                      Allow
                    </GhostBtn>
                    <GhostBtn
                      danger
                      onClick={async () => {
                        await aiConfirmFn({
                          data: { invocationId: String(p.invocationId), allow: false },
                        });
                        setMsgs((all) => [...all, { role: "assistant", text: "Denied." }]);
                      }}
                    >
                      Deny
                    </GhostBtn>
                  </div>
                </div>
              ))}
            </article>
          ))}
          {busy ? <p className="text-xs text-muted">Thinking…</p> : null}
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        </div>
        <form
          className="flex gap-2 border-t border-white/10 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            id="ai-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Trosmos…"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
          />
          <GhostBtn type="submit">Send</GhostBtn>
        </form>
      </div>
    </div>
  );
}

export function openAiShortcut() {
  useOs.getState().openApp("ai");
  window.setTimeout(() => document.getElementById("ai-input")?.focus(), 50);
}
