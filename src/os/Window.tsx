import { useCallback, useEffect, useRef } from "react";
import { APP_BY_ID } from "@/lib/trosmos/catalog";
import { AppGlyph } from "./icons";
import { useOs, type OsWindow } from "./store";
import { AppHost } from "@/apps/host";

function snapFromPoint(x: number, y: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const edge = 18;
  const workH = h - 36 - 72;
  if (y < 36 + edge) return { x: 0, y: 36, w, h: workH, kind: "max" };
  if (x < edge) return { x: 0, y: 36, w: Math.floor(w / 2), h: workH, kind: "left" };
  if (x > w - edge) return { x: Math.floor(w / 2), y: 36, w: Math.floor(w / 2), h: workH, kind: "right" };
  return null;
}

export function WindowFrame({ win }: { win: OsWindow }) {
  const reduce = useOs((s) => s.settings.reduceMotion);
  const focused = useOs((s) => s.focusedId === win.id);
  const snapOn = useOs((s) => s.settings.snapWindows);
  const def = APP_BY_ID[win.appId];
  const minW = def?.minSize.w ?? 280;
  const minH = def?.minSize.h ?? 200;
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number } | null>(null);
  const resize = useRef<{ edge: string; sx: number; sy: number; bx: number; by: number; bw: number; bh: number } | null>(
    null,
  );

  const onDrag = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest("button, input, textarea, a, [data-no-drag]")) return;
      useOs.getState().focus(win.id);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y, sx: win.x, sy: win.y };
    },
    [win.id, win.x, win.y],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (drag.current) {
        const x = e.clientX - drag.current.dx;
        const y = Math.max(36, e.clientY - drag.current.dy);
        useOs.getState().move(win.id, x, y);
        if (snapOn) useOs.getState().setSnap(snapFromPoint(e.clientX, e.clientY));
      } else if (resize.current) {
        const r = resize.current;
        let x = r.bx;
        let y = r.by;
        let w = r.bw;
        let h = r.bh;
        const dx = e.clientX - r.sx;
        const dy = e.clientY - r.sy;
        if (r.edge.includes("e")) w = Math.max(minW, r.bw + dx);
        if (r.edge.includes("s")) h = Math.max(minH, r.bh + dy);
        if (r.edge.includes("w")) {
          w = Math.max(minW, r.bw - dx);
          x = r.bx + r.bw - w;
        }
        if (r.edge.includes("n")) {
          h = Math.max(minH, r.bh - dy);
          y = r.by + r.bh - h;
        }
        useOs.getState().resize(win.id, x, y, w, h);
      }
    };
    const up = (e: PointerEvent) => {
      if (drag.current) {
        const snap = snapOn ? snapFromPoint(e.clientX, e.clientY) : null;
        if (snap) useOs.getState().applySnap(win.id, snap);
        else useOs.getState().setSnap(null);
      }
      drag.current = null;
      resize.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [win.id, minW, minH, snapOn]);

  if (win.minimized) return null;

  const style: React.CSSProperties = win.maximized
    ? { left: 0, top: 36, width: "100%", height: "calc(100% - 108px)" }
    : { left: win.x, top: win.y, width: win.w, height: win.h };

  const startResize = (edge: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    useOs.getState().focus(win.id);
    resize.current = { edge, sx: e.clientX, sy: e.clientY, bx: win.x, by: win.y, bw: win.w, bh: win.h };
  };

  return (
    <section
      role="dialog"
      aria-label={win.title}
      aria-modal="false"
      className={`os-window glass-strong absolute flex flex-col overflow-hidden ${reduce ? "" : "os-window-enter"} ${focused ? "ring-1 ring-white/20" : "opacity-95"}`}
      style={{ ...style, zIndex: win.z }}
      onPointerDown={() => useOs.getState().focus(win.id)}
    >
      <header
        className="flex h-11 shrink-0 cursor-grab items-center justify-between border-b border-white/10 px-3 active:cursor-grabbing"
        onPointerDown={onDrag}
        onDoubleClick={() => useOs.getState().toggleMax(win.id)}
      >
        <div className="flex items-center gap-2" data-no-drag>
          <button
            type="button"
            className="traffic traffic-close"
            aria-label="Close"
            onClick={() => useOs.getState().close(win.id)}
          />
          <button
            type="button"
            className="traffic traffic-min"
            aria-label="Minimize"
            onClick={() => useOs.getState().minimize(win.id)}
          />
          <button
            type="button"
            className="traffic traffic-max"
            aria-label="Maximize"
            onClick={() => useOs.getState().toggleMax(win.id)}
          />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <AppGlyph id={win.appId} icon={def?.icon} size={12} />
          <span className="truncate text-sm font-medium">{win.title}</span>
        </div>
        <span className="w-14" />
      </header>
      <div className="min-h-0 flex-1 overflow-hidden bg-black/20">
        <AppHost appId={win.appId} windowId={win.id} payload={win.payload} />
      </div>
      {!win.maximized && (
        <>
          <span className="absolute top-0 right-0 left-0 h-1 cursor-n-resize" onPointerDown={startResize("n")} />
          <span className="absolute right-0 bottom-0 left-0 h-1.5 cursor-s-resize" onPointerDown={startResize("s")} />
          <span className="absolute top-0 bottom-0 left-0 w-1.5 cursor-w-resize" onPointerDown={startResize("w")} />
          <span className="absolute top-0 right-0 bottom-0 w-1.5 cursor-e-resize" onPointerDown={startResize("e")} />
          <span
            className="absolute right-0 bottom-0 size-3 cursor-se-resize"
            onPointerDown={startResize("se")}
          />
        </>
      )}
    </section>
  );
}
