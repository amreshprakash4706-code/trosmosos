import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  isSameDay,
} from "date-fns";
import { createEventFn, deleteEventFn, listEventsExpandedFn, listTodosFn, updateEventFn } from "@/lib/trosmos/api";
import { GhostBtn, Toolbar, errMsg } from "./ui";
import { useOs } from "@/os/store";

type Ev = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean | string | number;
  recurrence?: string | null;
  remind_minutes?: number | null;
  todo_id?: string | null;
};

export function CalendarApp({ payload }: { payload?: { eventId?: string } }) {
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [events, setEvents] = useState<Ev[]>([]);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [remind, setRemind] = useState("15");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [todos, setTodos] = useState<Array<{ id: string; title: string; due_at: string | null }>>([]);

  const range = useMemo(() => {
    if (view === "day") return { from: new Date(cursor), to: addDays(cursor, 1) };
    if (view === "week") return { from: startOfWeek(cursor), to: endOfWeek(cursor) };
    return { from: startOfWeek(startOfMonth(cursor)), to: endOfWeek(endOfMonth(cursor)) };
  }, [cursor, view]);

  async function refresh() {
    try {
      const rows = (await listEventsExpandedFn({
        data: { from: range.from.toISOString(), to: addDays(range.to, 1).toISOString() },
      })) as Ev[];
      setEvents(rows);
      setTodos((await listTodosFn({ data: {} })) as Array<{ id: string; title: string; due_at: string | null }>);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, [range.from.toISOString(), range.to.toISOString()]);

  const days: Date[] = [];
  for (let d = new Date(range.from); d <= range.to; d = addDays(d, 1)) days.push(new Date(d));

  function step(dir: number) {
    if (view === "day") setCursor(addDays(cursor, dir));
    else if (view === "week") setCursor(addWeeks(cursor, dir));
    else setCursor(addMonths(cursor, dir));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar>
        <GhostBtn onClick={() => step(-1)}>Prev</GhostBtn>
        <span className="font-display text-sm">{format(cursor, "MMMM yyyy")}</span>
        <GhostBtn onClick={() => step(1)}>Next</GhostBtn>
        <GhostBtn onClick={() => setCursor(new Date())}>Today</GhostBtn>
        {(["month", "week", "day"] as const).map((v) => (
          <GhostBtn key={v} onClick={() => setView(v)}>
            {v}
          </GhostBtn>
        ))}
      </Toolbar>
      <form
        className="flex flex-wrap gap-2 border-b border-white/10 px-3 py-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          try {
            await createEventFn({
              data: {
                title,
                startsAt: new Date(when).toISOString(),
                remindMinutes: remind ? Number(remind) : null,
                recurrence: repeat || null,
              },
            });
            setTitle("");
            await refresh();
          } catch (err) {
            setError(errMsg(err));
          }
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New event"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
        />
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
        />
        <select
          value={remind}
          onChange={(e) => setRemind(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
        >
          <option value="">No reminder</option>
          <option value="5">5 min</option>
          <option value="15">15 min</option>
          <option value="30">30 min</option>
          <option value="60">1 hour</option>
        </select>
        <select
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
        >
          <option value="">Once</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <GhostBtn type="submit">Add</GhostBtn>
      </form>
      {error ? <p className="px-3 text-sm text-rose-300">{error}</p> : null}
      <div className={`min-h-0 flex-1 overflow-auto p-2 ${view === "month" ? "grid grid-cols-7 gap-1" : "space-y-2"}`}>
        {view === "month"
          ? days.map((d) => {
              const dayEvents = events.filter((ev) => isSameDay(new Date(ev.starts_at), d));
              const dayTodos = todos.filter((t) => t.due_at && isSameDay(new Date(t.due_at), d));
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => {
                    setCursor(d);
                    setView("day");
                  }}
                  className={`min-h-20 rounded-xl border border-white/8 p-1.5 text-left hover:bg-white/5 ${isSameDay(d, new Date()) ? "ring-1 ring-[var(--accent)]" : ""}`}
                >
                  <div className="text-[11px] text-muted">{format(d, "d")}</div>
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      className={`truncate rounded bg-[var(--accent)]/30 px-1 text-[10px] ${payload?.eventId && ev.id.startsWith(payload.eventId) ? "ring-1 ring-white" : ""}`}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dayTodos.slice(0, 2).map((t) => (
                    <div
                      key={t.id}
                      className="truncate text-[10px] text-amber-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        useOs.getState().openApp("tasks", { taskId: t.id });
                      }}
                    >
                      {t.title}
                    </div>
                  ))}
                </button>
              );
            })
          : days.map((d) => (
              <section key={d.toISOString()} className="rounded-xl border border-white/10 p-3">
                <h3 className="mb-2 font-display text-sm">{format(d, "EEEE d MMM")}</h3>
                {events
                  .filter((ev) => isSameDay(new Date(ev.starts_at), d))
                  .map((ev) => {
                    const occurrence = ev.id.includes(":");
                    return (
                      <div key={ev.id} className="flex items-center justify-between py-1 text-sm">
                        <span>
                          {format(new Date(ev.starts_at), "HH:mm")} · {ev.title}
                          {ev.remind_minutes ? ` · remind ${ev.remind_minutes}m` : ""}
                          {occurrence ? " · recurring" : ""}
                        </span>
                        <span className="flex gap-1">
                          {!occurrence ? (
                            <GhostBtn
                              onClick={async () => {
                                const next = window.prompt("Rename event", ev.title);
                                if (!next) return;
                                await updateEventFn({ data: { id: ev.id, title: next } });
                                await refresh();
                              }}
                            >
                              Edit
                            </GhostBtn>
                          ) : null}
                          {!occurrence ? (
                            <GhostBtn
                              danger
                              onClick={async () => {
                                await deleteEventFn({ data: { id: ev.id } });
                                await refresh();
                              }}
                            >
                              Delete
                            </GhostBtn>
                          ) : (
                            <span className="text-[11px] text-faint">occurrence</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                {todos
                  .filter((t) => t.due_at && isSameDay(new Date(t.due_at), d))
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="block text-xs text-amber-200"
                      onClick={() => useOs.getState().openApp("tasks", { taskId: t.id })}
                    >
                      Task · {t.title}
                    </button>
                  ))}
              </section>
            ))}
      </div>
    </div>
  );
}
