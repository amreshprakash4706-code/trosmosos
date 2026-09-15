import { useEffect, useState } from "react";
import { createTodoFn, deleteTodoFn, listTodosFn, updateTodoFn, createEventFn } from "@/lib/trosmos/api";
import { Empty, GhostBtn, Toolbar, errMsg } from "./ui";
import { useOs } from "@/os/store";

type Todo = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  parent_id: string | null;
};

export function TasksApp() {
  const workspaceId = useOs((s) => s.workspaceId);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setTodos((await listTodosFn({ data: { workspaceId } })) as Todo[]);
    } catch (e) {
      setError(errMsg(e));
    }
  }
  useEffect(() => {
    void refresh();
  }, [workspaceId]);

  const visible = todos.filter((t) => {
    if (filter === "open") return t.status !== "done";
    if (filter === "done") return t.status === "done";
    if (filter === "high") return t.priority === "high" || t.priority === "urgent";
    return true;
  });
  const roots = visible.filter((t) => !t.parent_id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar>
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            try {
              await createTodoFn({ data: { title, workspaceId } });
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
          <GhostBtn type="submit">Add</GhostBtn>
        </form>
        {["all", "open", "done", "high"].map((f) => (
          <GhostBtn key={f} onClick={() => setFilter(f)}>
            {f}
          </GhostBtn>
        ))}
      </Toolbar>
      {error ? <p className="px-3 text-sm text-rose-300">{error}</p> : null}
      <div className="min-h-0 flex-1 overflow-auto p-3 space-y-2">
        {!roots.length ? <Empty title="No tasks" body="Add a task or ask Trosmos AI to capture one." /> : null}
        {roots.map((t) => (
          <TaskRow
            key={t.id}
            todo={t}
            childrenTodos={todos.filter((c) => c.parent_id === t.id)}
            onChange={refresh}
          />
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  todo,
  childrenTodos,
  onChange,
}: {
  todo: Todo;
  childrenTodos: Todo[];
  onChange: () => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={todo.status === "done"}
          onChange={async () => {
            await updateTodoFn({
              data: { id: todo.id, status: todo.status === "done" ? "todo" : "done" },
            });
            await onChange();
          }}
          className="mt-1 size-4"
        />
        <div className="min-w-0 flex-1">
          <div className={`text-sm ${todo.status === "done" ? "text-muted line-through" : ""}`}>{todo.title}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-faint">
            <span className="rounded bg-white/10 px-1.5 py-0.5">{todo.priority}</span>
            {todo.due_at ? <span>due {new Date(todo.due_at).toLocaleString()}</span> : null}
          </div>
        </div>
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
            await updateTodoFn({ data: { id: todo.id, dueAt: new Date(due).toISOString() } });
            await createEventFn({
              data: {
                title: todo.title,
                startsAt: new Date(due).toISOString(),
                todoId: todo.id,
                allDay: false,
              },
            });
            await onChange();
          }}
        >
          Schedule
        </GhostBtn>
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
                  await updateTodoFn({
                    data: { id: c.id, status: c.status === "done" ? "todo" : "done" },
                  });
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
