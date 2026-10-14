import { getSql } from "@/lib/db";
import { fail } from "./errors";
import {
  DEFAULT_SETTINGS,
  fromJson,
  parseTags,
  rankHit,
  scoreMatch,
  toJson,
  uid,
  type OsSettings,
} from "./core";
import { APP_CATALOG } from "./catalog";
import { extractWikiLinks, resolveWikiLink } from "./wiki";
import { expandOccurrences, nextOccurrence, parseRecurrence } from "./recurrence";
import * as vfs from "./vfs.server";
import * as extra from "./vfs-extra.server";
import type { DesktopIcon, Json, SearchHit } from "./types";

export async function listNoteFolders(userId: string) {
  const sql = await getSql();
  return sql.query(
    `select id, parent_id, name, path, created_at from note_folders where user_id = $1 order by path`,
    [userId],
  );
}

export async function createNoteFolder(userId: string, name: string, parentId?: string | null) {
  const sql = await getSql();
  const clean = String(name || "").trim().slice(0, 80) || "Folder";
  let parentPath = "";
  if (parentId) {
    const p = await sql.query<{ path: string }>(
      `select path from note_folders where id = $1 and user_id = $2`,
      [parentId, userId],
    );
    if (!p[0]) fail(404, "Parent folder not found");
    parentPath = p[0].path;
  }
  const path = parentPath ? `${parentPath}/${clean}` : clean;
  const id = uid("nfd");
  await sql.query(
    `insert into note_folders (id, user_id, parent_id, name, path, created_at) values ($1,$2,$3,$4,$5,now())`,
    [id, userId, parentId || null, clean, path],
  );
  const rows = await sql.query(`select * from note_folders where id = $1`, [id]);
  return rows[0];
}

export async function deleteNoteFolder(userId: string, id: string) {
  const sql = await getSql();
  await sql.query(`update notes set folder_id = null, folder_path = null where user_id = $1 and folder_id = $2`, [
    userId,
    id,
  ]);
  await sql.query(`delete from note_folders where id = $1 and user_id = $2`, [id, userId]);
  return { ok: true as const };
}

export async function moveNoteToFolder(userId: string, noteId: string, folderId: string | null) {
  const sql = await getSql();
  const note = await sql.query(`select id from notes where id = $1 and user_id = $2`, [noteId, userId]);
  if (!note[0]) fail(404, "Note not found");
  let folderPath: string | null = null;
  if (folderId) {
    const f = await sql.query<{ path: string }>(`select path from note_folders where id = $1 and user_id = $2`, [
      folderId,
      userId,
    ]);
    if (!f[0]) fail(404, "Folder not found");
    folderPath = f[0].path;
  }
  await sql.query(`update notes set folder_id = $1, folder_path = $2, updated_at = now() where id = $3 and user_id = $4`, [
    folderId,
    folderPath,
    noteId,
    userId,
  ]);
  const rows = await sql.query(`select * from notes where id = $1`, [noteId]);
  return rows[0];
}

export async function noteBacklinks(userId: string, noteId: string) {
  const sql = await getSql();
  const target = await sql.query<{ id: string; title: string }>(
    `select id, title from notes where id = $1 and user_id = $2`,
    [noteId, userId],
  );
  if (!target[0]) fail(404, "Note not found");
  const all = await sql.query<{ id: string; title: string; content: string }>(
    `select id, title, content from notes where user_id = $1`,
    [userId],
  );
  const key = target[0].title.trim().toLowerCase();
  return all.filter((n) => n.id !== noteId && extractWikiLinks(n.content).some((t) => t.toLowerCase() === key));
}

export async function noteOutgoingLinks(userId: string, noteId: string) {
  const sql = await getSql();
  const note = await sql.query<{ id: string; title: string; content: string }>(
    `select id, title, content from notes where id = $1 and user_id = $2`,
    [noteId, userId],
  );
  if (!note[0]) fail(404, "Note not found");
  const all = await sql.query<{ id: string; title: string; content: string }>(
    `select id, title, content from notes where user_id = $1`,
    [userId],
  );
  const titles = extractWikiLinks(note[0].content);
  return titles.map((title) => {
    const hit = resolveWikiLink(all, title);
    return { title, noteId: hit?.id || null };
  });
}

export async function exportNoteMarkdown(userId: string, noteId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ title: string; content: string; tags_json: string | null }>(
    `select title, content, tags_json from notes where id = $1 and user_id = $2`,
    [noteId, userId],
  );
  if (!rows[0]) fail(404, "Note not found");
  const tags = parseTags(rows[0].tags_json);
  const md = `---\ntitle: ${rows[0].title}\n${tags.length ? `tags: ${tags.join(", ")}\n` : ""}---\n\n${rows[0].content}\n`;
  await vfs.mkdirp(userId, "/Home/Documents/Exports");
  const name = `${rows[0].title.replace(/[<>:"/\\|?*]/g, "") || "note"}.md`;
  const existing = await vfs.getNodeByPath(userId, `/Home/Documents/Exports/${name}`);
  if (existing && !existing.isDir) await vfs.writeFile(userId, existing.path, md);
  else await vfs.createFile(userId, "/Home/Documents/Exports", name, md);
  return { path: `/Home/Documents/Exports/${name}`, markdown: md };
}

export async function listSessions(userId: string) {
  const sql = await getSql();
  try {
    const rows = await sql.query<{
      id: string;
      expiresAt: string;
      createdAt: string;
      ipAddress: string | null;
      userAgent: string | null;
    }>(
      `select id, "expiresAt", "createdAt", "ipAddress", "userAgent" from "session" where "userId" = $1 order by "createdAt" desc`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      expiresAt: String(r.expiresAt),
      createdAt: String(r.createdAt),
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      current: false,
    }));
  } catch {
    return [];
  }
}

export async function revokeSession(userId: string, sessionId: string) {
  const sql = await getSql();
  await sql.query(`delete from "session" where id = $1 and "userId" = $2`, [sessionId, userId]);
  return { ok: true as const };
}

export async function deleteAccount(userId: string, confirm: string) {
  if (confirm !== "DELETE") fail(400, "Type DELETE to confirm account deletion");
  if (userId === "dev-user") fail(400, "The preview developer account cannot be deleted");
  const sql = await getSql();
  const tables = [
    "file_comments",
    "file_tags",
    "share_grants",
    "note_folders",
    "desktop_layouts",
    "shell_aliases",
    "shell_history",
    "window_layouts",
    "clipboard_items",
    "search_history",
    "mutations",
    "calendar_events",
    "todos",
    "notes",
    "ai_memories",
    "ai_tool_invocations",
    "ai_messages",
    "ai_conversations",
    "capabilities",
    "audit_logs",
    "jobs",
    "apps_installed",
    "notifications",
    "os_settings",
    "recent_items",
    "favorites",
    "vfs_versions",
    "vfs_nodes",
    "workspaces",
    "os_profiles",
  ];
  for (const t of tables) {
    try {
      if (t === "vfs_versions") {
        await sql.query(`delete from vfs_versions where user_id = $1`, [userId]);
      } else if (t === "ai_messages") {
        await sql.query(
          `delete from ai_messages where conversation_id in (select id from ai_conversations where user_id = $1)`,
          [userId],
        );
      } else {
        await sql.query(`delete from ${t} where user_id = $1`, [userId]);
      }
    } catch {
      /* table may not exist on a partial migrate */
    }
  }
  try {
    await sql.query(`delete from "session" where "userId" = $1`, [userId]);
    await sql.query(`delete from "account" where "userId" = $1`, [userId]);
    await sql.query(`delete from "user" where id = $1`, [userId]);
  } catch {
    /* auth tables may be unused in preview */
  }
  return { ok: true as const };
}

export async function saveDesktopLayout(
  userId: string,
  workspaceId: string,
  payload: { icons?: DesktopIcon[]; dock?: string[]; wallpaper?: string | null },
) {
  const sql = await getSql();
  const ws = await sql.query(`select id from workspaces where id = $1 and user_id = $2`, [workspaceId, userId]);
  if (!ws[0]) fail(404, "Workspace not found");
  const cur = await sql.query<{ icons_json: string; dock_json: string | null; wallpaper: string | null }>(
    `select icons_json, dock_json, wallpaper from desktop_layouts where user_id = $1 and workspace_id = $2`,
    [userId, workspaceId],
  );
  const icons = payload.icons ?? fromJson<DesktopIcon[]>(cur[0]?.icons_json, []);
  const dock = payload.dock ?? fromJson<string[] | null>(cur[0]?.dock_json, null);
  const wallpaper = payload.wallpaper === undefined ? cur[0]?.wallpaper || null : payload.wallpaper;
  await sql.query(
    `insert into desktop_layouts (user_id, workspace_id, icons_json, dock_json, wallpaper, updated_at)
     values ($1,$2,$3,$4,$5,now())
     on conflict (user_id, workspace_id) do update set
       icons_json = excluded.icons_json,
       dock_json = excluded.dock_json,
       wallpaper = excluded.wallpaper,
       updated_at = now()`,
    [userId, workspaceId, toJson(icons), dock ? toJson(dock) : null, wallpaper],
  );
  return { icons, dock, wallpaper };
}

export async function loadDesktopLayout(userId: string, workspaceId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ icons_json: string; dock_json: string | null; wallpaper: string | null }>(
    `select icons_json, dock_json, wallpaper from desktop_layouts where user_id = $1 and workspace_id = $2`,
    [userId, workspaceId],
  );
  if (!rows[0]) return { icons: [] as DesktopIcon[], dock: null as string[] | null, wallpaper: null as string | null };
  return {
    icons: fromJson<DesktopIcon[]>(rows[0].icons_json, []),
    dock: fromJson<string[] | null>(rows[0].dock_json, null),
    wallpaper: rows[0].wallpaper,
  };
}

export async function applyMutation(
  userId: string,
  input: { op: string; idempotencyKey: string; payload: Json },
) {
  const sql = await getSql();
  const key = String(input.idempotencyKey || "").slice(0, 120);
  if (!key) fail(400, "idempotencyKey required");
  const existing = await sql.query<{ status: string; result_json: string | null }>(
    `select status, result_json from mutations where user_id = $1 and idempotency_key = $2`,
    [userId, key],
  );
  if (existing[0]?.status === "applied") return fromJson(existing[0].result_json, { ok: true, replayed: true });
  const id = uid("mut");
  await sql.query(
    `insert into mutations (id, user_id, op, idempotency_key, status, payload_json, created_at)
     values ($1,$2,$3,$4,'pending',$5,now())
     on conflict (user_id, idempotency_key) do nothing`,
    [id, userId, input.op, key, toJson(input.payload)],
  );
  let result: unknown = { ok: true };
  try {
    const p = (input.payload || {}) as { [key: string]: Json };
    if (input.op === "note.update") {
      const { updateNote } = await import("./platform.server");
      result = await updateNote(userId, String(p.id), {
        title: typeof p.title === "string" ? p.title : undefined,
        content: typeof p.content === "string" ? p.content : undefined,
      });
    } else if (input.op === "note.create") {
      const { createNote } = await import("./platform.server");
      result = await createNote(userId, {
        title: typeof p.title === "string" ? p.title : "Untitled",
        content: typeof p.content === "string" ? p.content : "",
      });
    } else if (input.op === "todo.update") {
      const { updateTodo } = await import("./platform.server");
      result = await updateTodo(userId, String(p.id), p);
    } else if (input.op === "todo.create") {
      const { createTodo } = await import("./platform.server");
      result = await createTodo(userId, {
        title: String(p.title || "Task"),
        notes: typeof p.notes === "string" ? p.notes : undefined,
        priority: typeof p.priority === "string" ? p.priority : undefined,
        dueAt: typeof p.dueAt === "string" ? p.dueAt : null,
      });
    } else if (input.op === "todo.completeRecurring") {
      result = await completeRecurringTodo(userId, String(p.id));
    } else if (input.op === "vfs.rename") {
      result = await vfs.renameNode(userId, String(p.path), String(p.name));
    } else if (input.op === "vfs.favorite") {
      result = await vfs.setFavorite(userId, String(p.path), undefined, p.on !== false);
    } else if (input.op === "vfs.trash") {
      result = await vfs.trashNode(userId, String(p.path));
    } else if (input.op === "vfs.tags") {
      result = await extra.setTags(userId, String(p.path), Array.isArray(p.tags) ? p.tags.map(String) : []);
    } else {
      fail(400, `Unknown mutation op ${input.op}`);
    }
    await sql.query(
      `update mutations set status = 'applied', result_json = $1, applied_at = now()
        where user_id = $2 and idempotency_key = $3`,
      [toJson(result), userId, key],
    );
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mutation failed";
    await sql.query(
      `update mutations set status = 'error', error = $1 where user_id = $2 and idempotency_key = $3`,
      [message, userId, key],
    );
    throw err;
  }
}

export async function listPendingMutations(userId: string) {
  const sql = await getSql();
  return sql.query(
    `select id, op, idempotency_key, status, error, created_at from mutations
      where user_id = $1 order by created_at desc limit 40`,
    [userId],
  );
}

export async function notificationAction(
  userId: string,
  id: string,
  action: "dismiss" | "read" | "snooze" | "complete",
) {
  const sql = await getSql();
  const rows = await sql.query<{ id: string; data_json: string | null; category: string }>(
    `select id, data_json, category from notifications where id = $1 and user_id = $2`,
    [id, userId],
  );
  const n = rows[0];
  if (!n) fail(404, "Notification not found");
  const data = fromJson<{ kind?: string; id?: string }>(n.data_json, {});
  if (action === "dismiss") {
    await sql.query(`delete from notifications where id = $1 and user_id = $2`, [id, userId]);
    return { ok: true as const, action, data };
  }
  if (action === "read") {
    await sql.query(`update notifications set is_read = true where id = $1 and user_id = $2`, [id, userId]);
    return { ok: true as const, action, data };
  }
  if (action === "snooze") {
    const next = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    if (data.kind === "task" && data.id) {
      await sql.query(
        `update todos set remind_at = $1, last_reminded_at = null where id = $2 and user_id = $3`,
        [next, data.id, userId],
      );
    }
    if (data.kind === "event" && data.id) {
      try {
        await sql.query(
          `update calendar_events
              set next_remind_at = $1, last_reminded_at = now()
            where id = $2 and user_id = $3`,
          [next, data.id, userId],
        );
      } catch {
        /* column may be missing before migrate */
      }
    }
    await sql.query(`update notifications set is_read = true where id = $1 and user_id = $2`, [id, userId]);
    return { ok: true as const, action, remindAt: next, data };
  }
  if (action === "complete" && data.kind === "task" && data.id) {
    const { updateTodo } = await import("./platform.server");
    const todo = (await sql.query<{ recurrence: string | null }>(
      `select recurrence from todos where id = $1 and user_id = $2`,
      [data.id, userId],
    ))[0];
    if (todo?.recurrence) await completeRecurringTodo(userId, data.id);
    else await updateTodo(userId, data.id, { status: "done" });
    await sql.query(`update notifications set is_read = true where id = $1 and user_id = $2`, [id, userId]);
    return { ok: true as const, action, data };
  }
  return { ok: true as const, action, data };
}

export async function updateMemory(userId: string, id: string, content: string) {
  const sql = await getSql();
  const text = String(content || "").trim().slice(0, 2000);
  if (!text) fail(400, "Memory content required");
  const cur = await sql.query(`select id from ai_memories where id = $1 and user_id = $2`, [id, userId]);
  if (!cur[0]) fail(404, "Memory not found");
  await sql.query(`update ai_memories set content = $1 where id = $2 and user_id = $3`, [text, id, userId]);
  const rows = await sql.query(`select * from ai_memories where id = $1`, [id]);
  return rows[0];
}

export async function fireDueReminders(userId: string) {
  const sql = await getSql();
  const { createNotification } = await import("./platform.server");
  const todos = await sql.query<{ id: string; title: string }>(
    `select id, title from todos
      where user_id = $1 and status <> 'done' and status <> 'cancelled'
        and remind_at is not null and remind_at <= now() and last_reminded_at is null
      limit 20`,
    [userId],
  );
  for (const t of todos) {
    await createNotification(userId, {
      title: "Task reminder",
      body: t.title,
      type: "info",
      category: "reminder",
      data: { kind: "task", id: t.id },
    });
    await sql.query(`update todos set last_reminded_at = now() where id = $1 and user_id = $2`, [t.id, userId]);
  }
  const events = await sql.query<{ id: string; title: string; starts_at: string; remind_minutes: number }>(
    `select id, title, starts_at, remind_minutes from calendar_events
      where user_id = $1
        and (
          (next_remind_at is not null and next_remind_at <= now()
            and (last_reminded_at is null or last_reminded_at < next_remind_at))
          or (
            next_remind_at is null
            and remind_minutes is not null
            and last_reminded_at is null
            and starts_at - (remind_minutes || ' minutes')::interval <= now()
            and starts_at >= now() - interval '6 hours'
          )
        )
      limit 20`,
    [userId],
  );
  for (const e of events) {
    await createNotification(userId, {
      title: "Event reminder",
      body: `${e.title} · ${new Date(e.starts_at).toLocaleString()}`,
      type: "info",
      category: "reminder",
      data: { kind: "event", id: e.id },
    });
    await sql.query(
      `update calendar_events set last_reminded_at = now(), next_remind_at = null where id = $1 and user_id = $2`,
      [e.id, userId],
    );
  }
  return { todos: todos.length, events: events.length };
}

export async function completeRecurringTodo(userId: string, id: string) {
  const { updateTodo, createTodo } = await import("./platform.server");
  const sql = await getSql();
  const rows = await sql.query<{
    id: string;
    title: string;
    notes: string | null;
    priority: string;
    due_at: string | null;
    remind_at: string | null;
    recurrence: string | null;
    tags_json: string | null;
    workspace_id: string | null;
    parent_id: string | null;
  }>(`select * from todos where id = $1 and user_id = $2`, [id, userId]);
  const cur = rows[0];
  if (!cur) fail(404, "Task not found");
  const done = await updateTodo(userId, id, { status: "done" });
  const rule = parseRecurrence(cur.recurrence);
  if (!rule || !cur.due_at) return { completed: done, next: null };
  const nextDue = nextOccurrence(new Date(cur.due_at), rule);
  let nextRemind: string | null = null;
  if (cur.remind_at && cur.due_at) {
    const delta = new Date(cur.due_at).getTime() - new Date(cur.remind_at).getTime();
    nextRemind = new Date(nextDue.getTime() - delta).toISOString();
  }
  const next = await createTodo(userId, {
    title: cur.title,
    notes: cur.notes || undefined,
    priority: cur.priority,
    dueAt: nextDue.toISOString(),
    remindAt: nextRemind,
    workspaceId: cur.workspace_id,
    parentId: cur.parent_id,
    tags: parseTags(cur.tags_json),
    recurrence: cur.recurrence,
  });
  return { completed: done, next };
}

export async function expandEventRange(userId: string, from: string, to: string) {
  const { listEvents } = await import("./platform.server");
  const sql = await getSql();
  const rows = (await listEvents(userId, from, to)) as Array<{
    id: string;
    title: string;
    starts_at: string;
    ends_at: string | null;
    recurrence: string | null;
    all_day: boolean;
  }>;
  let recurring: typeof rows = [];
  try {
    recurring = (await sql.query(
      `select * from calendar_events
        where user_id = $1 and recurrence is not null and recurrence <> '' and starts_at < $2`,
      [userId, to],
    )) as typeof rows;
  } catch {
    recurring = [];
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of recurring) if (!byId.has(r.id)) rows.push(r);
  const rangeStart = new Date(from);
  const rangeEnd = new Date(to);
  const extra: typeof rows = [];
  for (const ev of rows) {
    const rule = parseRecurrence(ev.recurrence);
    if (!rule) continue;
    const start = new Date(ev.starts_at);
    const dur = ev.ends_at ? new Date(ev.ends_at).getTime() - start.getTime() : 0;
    for (const occ of expandOccurrences(start, rule, rangeStart, rangeEnd)) {
      if (occ.getTime() === start.getTime()) continue;
      extra.push({
        ...ev,
        id: `${ev.id}:${occ.toISOString()}`,
        starts_at: occ.toISOString(),
        ends_at: dur ? new Date(occ.getTime() + dur).toISOString() : null,
      });
    }
  }
  return [...rows, ...extra].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
}

export async function rankedSearch(userId: string, query: string, storeHistory = true) {
  const q = String(query || "").trim().slice(0, 120);
  if (!q) return { query: q, results: [] as SearchHit[] };
  const sql = await getSql();
  const settings = await sql.query<{ value_json: string }>(
    `select value_json from os_settings where user_id = $1 and key = 'prefs'`,
    [userId],
  );
  const prefs = { ...DEFAULT_SETTINGS, ...fromJson<Partial<OsSettings>>(settings[0]?.value_json, {}) };
  if (storeHistory && prefs.privacyStoreSearch !== false) {
    await sql.query(`insert into search_history (id, user_id, query, created_at) values ($1,$2,$3,now())`, [
      uid("srh"),
      userId,
      q,
    ]);
    await sql.query(
      `delete from search_history where id in (
         select id from search_history where user_id = $1 order by created_at desc offset 40
       )`,
      [userId],
    );
  }

  const results: SearchHit[] = [];
  const files = await vfs.searchFiles(userId, q, 24);
  let tagHits: Array<{ path: string; tag: string }> = [];
  try {
    tagHits = await sql.query<{ path: string; tag: string }>(
      `select path, tag from file_tags where user_id = $1 and tag ilike $2`,
      [userId, `%${q}%`],
    );
  } catch {
    tagHits = [];
  }
  const fileByPath = new Map(files.map((f) => [f.path, f]));
  for (const t of tagHits) {
    if (!fileByPath.has(t.path)) {
      const n = await vfs.getNodeByPath(userId, t.path);
      if (n) {
        files.push(n);
        fileByPath.set(t.path, n);
      }
    }
  }
  for (const f of files) {
    const tags = tagHits.filter((t) => t.path === f.path).map((t) => t.tag);
    results.push({
      id: f.id,
      kind: f.isDir ? "folder" : "file",
      title: f.name,
      subtitle: f.path,
      path: f.path,
      score: rankHit(q, { title: f.name, path: f.path, kind: f.isDir ? "folder" : "file", tags }),
    });
  }
  const notes = await sql.query<{ id: string; title: string; preview: string | null; tags_json: string | null; updated_at: string }>(
    `select id, title, preview, tags_json, updated_at from notes
      where user_id = $1 and (title ilike $2 or content ilike $2 or tags_json ilike $2) limit 16`,
    [userId, `%${q}%`],
  );
  for (const n of notes) {
    results.push({
      id: n.id,
      kind: "note",
      title: n.title,
      subtitle: n.preview || undefined,
      score: rankHit(
        q,
        { title: n.title, subtitle: n.preview, kind: "note", tags: parseTags(n.tags_json) },
        { recencyMs: Date.now() - new Date(n.updated_at).getTime() },
      ),
      snippet: n.preview || undefined,
    });
  }
  const todos = await sql.query<{ id: string; title: string; status: string; tags_json: string | null }>(
    `select id, title, status, tags_json from todos where user_id = $1 and (title ilike $2 or notes ilike $2 or tags_json ilike $2) limit 16`,
    [userId, `%${q}%`],
  );
  for (const t of todos) {
    results.push({
      id: t.id,
      kind: "task",
      title: t.title,
      subtitle: t.status,
      score: rankHit(q, { title: t.title, subtitle: t.status, kind: "task", tags: parseTags(t.tags_json) }),
    });
  }
  const events = await sql.query<{ id: string; title: string; starts_at: string }>(
    `select id, title, starts_at from calendar_events where user_id = $1 and (title ilike $2 or description ilike $2) limit 10`,
    [userId, `%${q}%`],
  );
  for (const e of events) {
    results.push({
      id: e.id,
      kind: "event",
      title: e.title,
      subtitle: String(e.starts_at),
      score: scoreMatch(q, e.title),
    });
  }
  for (const app of APP_CATALOG) {
    const s = rankHit(q, { title: app.name, subtitle: app.description, kind: "app", tags: app.keywords });
    if (s > 0) results.push({ id: app.id, kind: "app", title: app.name, subtitle: app.description, score: s });
  }
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const s = scoreMatch(q, key, "settings");
    if (s > 0) results.push({ id: key, kind: "setting", title: key, subtitle: "Settings", score: s });
  }
  results.sort((a, b) => Number(b.score) - Number(a.score));
  return { query: q, results: results.slice(0, 48) };
}

export async function clearSearchHistory(userId: string) {
  const sql = await getSql();
  await sql.query(`delete from search_history where user_id = $1`, [userId]);
  return { ok: true as const };
}

export async function listShellHistory(userId: string) {
  const sql = await getSql();
  return sql.query(
    `select id, command, cwd, created_at from shell_history where user_id = $1 order by created_at desc limit 80`,
    [userId],
  );
}

export async function pushShellHistory(userId: string, command: string, cwd: string) {
  const sql = await getSql();
  await sql.query(`insert into shell_history (id, user_id, command, cwd, created_at) values ($1,$2,$3,$4,now())`, [
    uid("sh"),
    userId,
    command.slice(0, 500),
    cwd,
  ]);
  await sql.query(
    `delete from shell_history where id in (
       select id from shell_history where user_id = $1 order by created_at desc offset 120
     )`,
    [userId],
  );
}

export async function listAliases(userId: string) {
  const sql = await getSql();
  return sql.query(`select name, command from shell_aliases where user_id = $1 order by name`, [userId]);
}

export async function setAlias(userId: string, name: string, command: string) {
  const n = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
  if (!n) fail(400, "Alias name required");
  const sql = await getSql();
  await sql.query(
    `insert into shell_aliases (user_id, name, command, created_at) values ($1,$2,$3,now())
     on conflict (user_id, name) do update set command = excluded.command`,
    [userId, n, String(command).slice(0, 400)],
  );
  return listAliases(userId);
}

export async function deleteAlias(userId: string, name: string) {
  const sql = await getSql();
  await sql.query(`delete from shell_aliases where user_id = $1 and name = $2`, [userId, name]);
  return { ok: true as const };
}

export async function updateConversation(
  userId: string,
  id: string,
  patch: { title?: string; pinned?: boolean },
) {
  const sql = await getSql();
  const cur = await sql.query(`select id from ai_conversations where id = $1 and user_id = $2`, [id, userId]);
  if (!cur[0]) fail(404, "Conversation not found");
  await sql.query(
    `update ai_conversations set
        title = coalesce($1, title),
        pinned = coalesce($2, pinned),
        updated_at = now()
      where id = $3 and user_id = $4`,
    [patch.title?.slice(0, 120) || null, patch.pinned ?? null, id, userId],
  );
  const rows = await sql.query(`select id, title, pinned, created_at, updated_at from ai_conversations where id = $1`, [
    id,
  ]);
  return rows[0];
}

export async function filterTodos(
  userId: string,
  opts: {
    status?: string;
    priority?: string;
    tag?: string;
    due?: "overdue" | "today" | "upcoming" | "none";
    workspaceId?: string | null;
  } = {},
) {
  const { listTodos } = await import("./platform.server");
  const all = (await listTodos(userId, opts.workspaceId)) as Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    due_at: string | null;
    tags_json: string | null;
    parent_id: string | null;
  }>;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return all.filter((t) => {
    if (opts.status && t.status !== opts.status) return false;
    if (opts.priority && t.priority !== opts.priority) return false;
    if (opts.tag && !parseTags(t.tags_json).includes(opts.tag.toLowerCase())) return false;
    if (opts.due === "none" && t.due_at) return false;
    if (opts.due === "overdue") {
      if (!t.due_at || t.status === "done") return false;
      if (new Date(t.due_at) >= now) return false;
    }
    if (opts.due === "today") {
      if (!t.due_at) return false;
      const d = new Date(t.due_at);
      if (d < start || d >= end) return false;
    }
    if (opts.due === "upcoming") {
      if (!t.due_at) return false;
      if (new Date(t.due_at) < end) return false;
    }
    return true;
  });
}

export { extra };
