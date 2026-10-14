import { useEffect, useState } from "react";
import {
  completeRecurringFn,
  createEventFn,
  createTodoFn,
  deleteEventFn,
  deleteTodoFn,
  filterTodosFn,
  listTodosFn,
  updateTodoFn,
} from "@/lib/trosmos/api";
import { enqueueLocal, isBrowserOnline } from "@/lib/trosmos/offline";
import { Empty, GhostBtn, Toolbar, errMsg } from "./ui";
import { useOs } from "@/os/store";

type Todo = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  remind_at: string | null;
  recurrence: string | null;
  parent_id: string | null;
  calendar_event_id?: string | null;
  tags_json?: string | null;
};

const COLS = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "Doing" },
  { id: "done", label: "Done" },
] as const;

export function TasksApp({ payload }: { payload?: { taskId?: string } }) {
  const workspaceId = useOs((s) => s.workspaceId);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [recurrence, setRecurrence] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      if (filter === "all" || filter === "open" || filter === "done" || filter === "high") {
        setTodos((await listTodosFn({ data: { workspaceId } })) as Todo[]);
      } else {
        const due = filter === "overdue" || filter === "today" || filter === "upcoming" ? filter : undefined;
        setTodos((await filterTodosFn({ data: { due, workspaceId } })) as Todo[]);
      }
    } catch (e) {
      setError(errMsg(e));
    }
  }
  useEffect(() => {
    void refresh();
  }, [workspaceId, filter]);

  const visible = todos.filter((t) => {
    if (filter === "open") return t.status !== "done";
    if (filter === "done") return t.status === "done";
    if (filter === "high") return t.priority === "high" || t.priority === "urgent";
    return true;
  });
  const roots = visible.filter((t) => !t.parent_id);

  async function patchTodo(id: string, data: Parameters<typeof updateTodoFn>[0]["data"]) {
    if (!isBrowserOnline()) {
      await enqueueLocal("todo.update", data);
      return;
    }
    await updateTodoFn({ data });
  }

  async function complete(todo: Todo) {
    if (todo.recurrence && todo.status !== "done") {
      await completeRecurringFn({ data: { id: todo.id } });
    } else {
      await patchTodo(todo.id, { id: todo.id, status: todo.status === "done" ? "todo" : "done" });
    }
    await refresh();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar>
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            try {
              if (!isBrowserOnline()) {
                await enqueueLocal("todo.create", { title, workspaceId, recurrence: recurrence || null });
              } else {
                await createTodoFn({ data: { title, workspaceId, recurrence: recurrence || null } });
              }
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
            placeholder="Add a task"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm"
          />
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
          >
            <option value="">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <GhostBtn type="submit">Add</GhostBtn>
        </form>
        <GhostBtn onClick={() => setView(view === "list" ? "kanban" : "list")}>{view}</GhostBtn>
        {["all", "open", "done", "high", "overdue", "today", "upcoming"].map((f) => (
          <GhostBtn key={f} onClick={() => setFilter(f)}>
            {f}
          </GhostBtn>
        ))}
      </Toolbar>
      {error ? <p className="px-3 text-sm text-rose-300">{error}</p> : null}
      {view === "kanban" ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-auto p-3">
          {COLS.map((col) => (
            <section key={col.id} className="kanban-col rounded-xl border border-white/10 bg-white/4 p-2">
              <h3 className="mb-2 text-xs uppercase text-faint">{col.label}</h3>
              {roots
                .filter((t) => t.status === col.id)
                .map((t) => (
                  <article key={t.id} className="mb-2 rounded-lg bg-white/8 p-2 text-sm">
                    <div>{t.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {COLS.filter((c) => c.id !== t.status).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="rounded bg-white/10 px-1 text-[10px]"
                          onClick={async () => {
                            if (c.id === "done") await complete(t);
                            else await patchTodo(t.id, { id: t.id, status: c.id });
                            await refresh();
                          }}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-3 space-y-2">
          {!roots.length ? <Empty title="No tasks" body="Add a task or ask Trosmos AI to capture one." /> : null}
          {roots.map((t) => (
            <TaskRow
              key={t.id}
              todo={t}
              highlight={payload?.taskId === t.id}
              childrenTodos={todos.filter((c) => c.parent_id === t.id)}
              onChange={refresh}
              onComplete={complete}
              onPatch={patchTodo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  todo,
  childrenTodos,
  onChange,
  onComplete,
  onPatch,
  highlight,
}: {
  todo: Todo;
  childrenTodos: Todo[];
  onChange: () => Promise<void>;
  onComplete: (t: Todo) => Promise<void>;
  onPatch: (id: string, data: Parameters<typeof updateTodoFn>[0]["data"]) => Promise<void>;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-3 ${highlight ? "ring-1 ring-[var(--accent)]" : ""}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={todo.status === "done"}
          onChange={() => void onComplete(todo)}
          className="mt-1 size-4"
        />
        <div className="min-w-0 flex-1">
          <div className={`text-sm ${todo.status === "done" ? "text-muted line-through" : ""}`}>{todo.title}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-faint">
            <span className="rounded bg-white/10 px-1.5 py-0.5">{todo.priority}</span>
            {todo.due_at ? <span>due {new Date(todo.due_at).toLocaleString()}</span> : null}
            {todo.recurrence ? <span>repeats {todo.recurrence}</span> : null}
            {todo.calendar_event_id ? <span>on calendar</span> : null}
          </div>
        </div>
        <select
          value={todo.recurrence || ""}
          onChange={async (e) => {
            await onPatch(todo.id, { id: todo.id, recurrence: e.target.value || null });
            await onChange();
          }}
          className="rounded border border-white/10 bg-white/5 px-1 text-[11px]"
        >
          <option value="">Once</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <GhostBtn
          onClick={async () => {
            const name = window.prompt("Subtask");
            if (!name) return;
            await createTodoFn({ data: { title: name, parentId: todo.id } });
            await onChange();
          }}
        >
          Sub
        </GhostBtn>
        <GhostBtn
          onClick={async () => {
            const due = window.prompt("Due date (YYYY-MM-DDTHH:mm)", new Date().toISOString().slice(0, 16));
            if (!due) return;
            await onPatch(todo.id, { id: todo.id, dueAt: new Date(due).toISOString(), remindAt: new Date(new Date(due).getTime() - 15 * 60 * 1000).toISOString() });
            await createEventFn({
              data: {
                title: todo.title,
                startsAt: new Date(due).toISOString(),
                todoId: todo.id,
                remindMinutes: 15,
              },
            });
            await onChange();
          }}
        >
          Schedule
        </GhostBtn>
        {todo.calendar_event_id ? (
          <GhostBtn
            onClick={async () => {
              await deleteEventFn({ data: { id: todo.calendar_event_id! } });
              await onChange();
            }}
          >
            Unschedule
          </GhostBtn>
        ) : null}
        <GhostBtn
          danger
          onClick={async () => {
            await deleteTodoFn({ data: { id: todo.id } });
            await onChange();
          }}
        >
          Delete
        </GhostBtn>
      </div>
      {childrenTodos.length ? (
        <div className="mt-2 ml-6 space-y-1">
          {childrenTodos.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={c.status === "done"}
                onChange={async () => {
                  await onPatch(c.id, { id: c.id, status: c.status === "done" ? "todo" : "done" });
                  await onChange();
                }}
              />
              {c.title}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
