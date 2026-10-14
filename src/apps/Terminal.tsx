import { useEffect, useRef, useState } from "react";
import { decode, runShellFn } from "@/lib/trosmos/api";
import { OS_VERSION } from "@/lib/trosmos/core";
import { BUILTINS } from "@/lib/trosmos/terminal";
import { useOs } from "@/os/store";

type Line = { kind: "in" | "out" | "err"; text: string };

export function TerminalApp() {
  const [cwd, setCwd] = useState(useOs.getState().cwd || "/Home");
  const [lines, setLines] = useState<Line[]>([
    { kind: "out", text: `Trosmos shell ${OS_VERSION} — type help. This is not a host OS shell.` },
  ]);
  const [value, setValue] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hidx, setHidx] = useState(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines]);

  async function run(cmd: string) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    if (trimmed === "clear") {
      setLines([]);
      return;
    }
    setLines((l) => [...l, { kind: "in", text: `${cwd} % ${trimmed}` }]);
    setHist((h) => [trimmed, ...h].slice(0, 80));
    setHidx(-1);
    try {
      const out = decode<{ cwd: string; stdout: string; stderr?: string; open?: { appId: string; path?: string } }>(
        await runShellFn({ data: { command: trimmed, cwd } }),
      );
      setCwd(out.cwd);
      if (out.stdout) setLines((l) => [...l, { kind: "out", text: out.stdout }]);
      if (out.stderr) setLines((l) => [...l, { kind: "err", text: out.stderr || "" }]);
      if (out.open?.appId) useOs.getState().openApp(out.open.appId, { path: out.open.path });
    } catch (e) {
      setLines((l) => [...l, { kind: "err", text: e instanceof Error ? e.message : "error" }]);
    }
  }

  function complete() {
    const parts = value.split(" ");
    const last = parts[parts.length - 1] || "";
    const hits = BUILTINS.filter((b) => b.startsWith(last));
    if (hits.length === 1) {
      parts[parts.length - 1] = hits[0];
      setValue(parts.join(" ") + " ");
    } else if (hits.length) {
      setLines((l) => [...l, { kind: "out", text: hits.join("  ") }]);
    }
  }

  return (
    <div
      className="flex h-full flex-col bg-[#07080c] font-mono text-[12.5px] text-emerald-100/90"
      onClick={() => input.current?.focus()}
    >
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto p-3 space-y-1" role="log" aria-live="polite">
        {lines.map((ln, i) => (
          <pre
            key={i}
            className={`whitespace-pre-wrap break-words ${ln.kind === "in" ? "text-cyan-200" : ln.kind === "err" ? "text-rose-300" : "text-emerald-100/85"}`}
          >
            {ln.text}
          </pre>
        ))}
      </div>
      <form
        className="flex items-center gap-2 border-t border-white/10 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = value;
          setValue("");
          void run(v);
        }}
      >
        <span className="shrink-0 text-cyan-300">{cwd} %</span>
        <input
          ref={input}
          value={value}
          aria-label="Shell command"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              complete();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const next = hist[hidx + 1];
              if (next != null) {
                setHidx(hidx + 1);
                setValue(next);
              }
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const next = hist[hidx - 1] || "";
              setHidx(Math.max(-1, hidx - 1));
              setValue(next);
            }
          }}
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </form>
    </div>
  );
}
