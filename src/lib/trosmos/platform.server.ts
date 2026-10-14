import { getSql } from "@/lib/db";
import { APP_CATALOG } from "./catalog";
import {
  DEFAULT_SETTINGS,
  OS_VERSION,
  fromJson,
  toJson,
  uid,
  type OsSettings,
} from "./core";
import { fail } from "./errors";
import * as vfs from "./vfs.server";
import type { Json } from "./types";

export const SCOPES = {
  VFS_READ: "vfs:read",
  VFS_WRITE: "vfs:write",
  VFS_DELETE: "vfs:delete",
  AI_TOOL: "ai:tool",
  APP_INSTALL: "app:install",
  ADMIN: "admin",
} as const;

const WELCOME_MD = `# Welcome to Trosmos OS ${OS_VERSION}

This is your personal operating environment. Everything here belongs to your account. Trosmos OS 5.1 adds share links, tags, comments, ZIP archives, Mission Control, and a stronger Files/Editor/Notes/Tasks workspace.

## What you can do

- **Files** — a real virtual filesystem with folders, trash, versions, favorites, and search
- **Editor** — open any text file from the VFS, with tabs and autosave
- **Terminal** — a Trosmos shell for files, notes, tasks, and system commands (not a host OS shell)
- **Notes & Tasks** — workspace-scoped productivity
- **Calendar** — events that can link to tasks
- **Trosmos AI** — Grok with capability-gated tools; mutating actions ask before they run
- **Workspaces** — switch complete desktop environments

Press **Ctrl/⌘ K** for the command palette, **Ctrl/⌘ /** for AI, **Alt Tab** to switch windows.

Your data is stored in the Trosmos database, isolated per account.
`;

const GETTING_STARTED = `# Getting started

1. Open **Files** from the dock and explore \`/Home\`.
2. Create a note or a task — both are searchable from the command palette.
3. Sign in on another device with the same account to pick up where you left off.
4. Open **Settings** to change accent color, dock, motion, and AI confirmation.
5. Ask Trosmos AI to organize a folder or summarize a document. Confirm any write.

## Honest limits

- This is a web operating environment, not a host OS. The Terminal cannot run Linux binaries.
- Binary files are limited to ~1.5 MB because of serverless request size.
- Atlas (the browser) can only embed sites that allow it.
- Background jobs run when you use Trosmos; there is no always-on worker on the hosted deployment.
`;

export async function ensureBootstrapped(
  userId: string,
  profile: { displayName?: string | null; email?: string | null },
) {
  const sql = await getSql();
  const existing = await sql.query<{ bootstrapped_at: string | null }>(
    `select bootstrapped_at from os_profiles where user_id = $1`,
    [userId],
  );
  if (existing[0]?.bootstrapped_at) {
    return { fresh: false as const };
  }

  const display =
    profile.displayName ||
    (profile.email ? profile.email.split("@")[0] : "Operator");

  if (!existing[0]) {
    await sql.query(
      `insert into os_profiles (user_id, display_name, username, bootstrapped_at, created_at, updated_at)
       values ($1,$2,$3,now(),now(),now())
       on conflict (user_id) do nothing`,
      [userId, display, display.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "user"],
    );
  }

  const wsId = uid("ws");
  await sql.query(
    `insert into workspaces (id, user_id, name, color, is_active, sort_order, created_at, updated_at)
     values ($1,$2,'Personal','#3B82F6',true,0,now(),now())`,
    [wsId, userId],
  );

  async function folder(path: string, parentId: string | null, name: string) {
    const id = uid("fil");
    await sql.query(
      `insert into vfs_nodes (id, user_id, workspace_id, parent_id, name, path, is_dir, size, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,true,0,now(),now())
       on conflict (user_id, path) do nothing`,
      [id, userId, wsId, parentId, name, path],
    );
    const row = await sql.query<{ id: string }>(
      `select id from vfs_nodes where user_id = $1 and path = $2`,
      [userId, path],
    );
    return row[0]?.id || id;
  }

  const rootId = await folder("/", null, "root");
  const homeId = await folder("/Home", rootId, "Home");
  await folder("/Trash", rootId, "Trash");
  const desktopId = await folder("/Home/Desktop", homeId, "Desktop");
  const docsId = await folder("/Home/Documents", homeId, "Documents");
  await folder("/Home/Downloads", homeId, "Downloads");
  await folder("/Home/Pictures", homeId, "Pictures");
  await folder("/Home/Notes", homeId, "Notes");
  await folder("/Home/Projects", homeId, "Projects");
  void desktopId;

  async function seedFile(parentId: string, parentPath: string, name: string, content: string) {
    const path = `${parentPath}/${name}`;
    const exists = await sql.query(`select id from vfs_nodes where user_id = $1 and path = $2`, [userId, path]);
    if (exists[0]) return;
    await sql.query(
      `insert into vfs_nodes
        (id, user_id, workspace_id, parent_id, name, path, is_dir, mime_type, size, content, content_encoding, version, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,false,'text/markdown',$7,$8,'utf8',1,now(),now())`,
      [uid("fil"), userId, wsId, parentId, name, path, new TextEncoder().encode(content).length, content],
    );
  }

  await seedFile(docsId, "/Home/Documents", "Welcome.md", WELCOME_MD);
  await seedFile(docsId, "/Home/Documents", "Getting Started.md", GETTING_STARTED);

  for (const scope of [SCOPES.VFS_READ, SCOPES.VFS_WRITE, SCOPES.VFS_DELETE, SCOPES.AI_TOOL, SCOPES.APP_INSTALL]) {
    await sql.query(
      `insert into capabilities (id, user_id, scope, resource, granted_at)
       values ($1,$2,$3,'/',now())
       on conflict (user_id, scope, resource) do nothing`,
      [uid("cap"), userId, scope],
    );
  }

  for (const app of APP_CATALOG) {
    await sql.query(
      `insert into apps_installed (id, user_id, app_id, version, enabled, installed_at)
       values ($1,$2,$3,$4,true,now())
       on conflict (user_id, app_id) do nothing`,
      [uid("app"), userId, app.id, app.version],
    );
  }

  await sql.query(
    `insert into os_settings (user_id, key, value_json, updated_at)
     values ($1,'prefs',$2,now())
     on conflict (user_id, key) do nothing`,
    [userId, toJson(DEFAULT_SETTINGS)],
  );

  await sql.query(
    `insert into notifications (id, user_id, title, body, type, category, priority, created_at)
     values ($1,$2,$3,$4,'success','system','normal',now())`,
    [
      uid("ntf"),
      userId,
      "Trosmos is ready",
      `Welcome, ${display}. Your Personal workspace and Home folder are set up.`,
    ],
  );

  await sql.query(`update os_profiles set bootstrapped_at = now(), display_name = coalesce(display_name, $2), updated_at = now() where user_id = $1`, [
    userId,
    display,
  ]);

  return { fresh: true as const, workspaceId: wsId };
}

export async function getProfile(userId: string) {
  const sql = await getSql();
  const rows = await sql.query<{
    user_id: string;
    display_name: string | null;
    username: string | null;
    timezone: string;
    role: string;
    storage_used: number | string;
    bootstrapped_at: string | null;
    created_at: string;
  }>(`select * from os_profiles where user_id = $1`, [userId]);
  return rows[0] || null;
}

export async function updateProfile(
  userId: string,
  patch: { displayName?: string; timezone?: string },
) {
  const sql = await getSql();
  const cur = await getProfile(userId);
  if (!cur) fail(404, "Profile not found");
  const displayName = patch.displayName?.trim().slice(0, 80) || cur.display_name;
  const timezone = patch.timezone?.trim().slice(0, 80) || cur.timezone;
  await sql.query(
    `update os_profiles set display_name = $1, timezone = $2, updated_at = now() where user_id = $3`,
    [displayName, timezone, userId],
  );
  return getProfile(userId);
}

export async function getSettings(userId: string): Promise<OsSettings> {
  const sql = await getSql();
  const rows = await sql.query<{ value_json: string }>(
    `select value_json from os_settings where user_id = $1 and key = 'prefs'`,
    [userId],
  );
  return { ...DEFAULT_SETTINGS, ...fromJson(rows[0]?.value_json, {}) };
}

export async function setSettings(userId: string, patch: Partial<OsSettings>): Promise<OsSettings> {
  const current = await getSettings(userId);
  const next = { ...current, ...patch };
  const sql = await getSql();
  await sql.query(
    `insert into os_settings (user_id, key, value_json, updated_at)
     values ($1,'prefs',$2,now())
     on conflict (user_id, key) do update set value_json = excluded.value_json, updated_at = now()`,
    [userId, toJson(next)],
  );
  return next;
}

export async function listNotifications(userId: string, unreadOnly = false) {
  const sql = await getSql();
  if (unreadOnly) {
    return sql.query(
      `select * from notifications where user_id = $1 and is_read = false order by created_at desc limit 100`,
      [userId],
    );
  }
  return sql.query(`select * from notifications where user_id = $1 order by created_at desc limit 100`, [userId]);
}

export async function createNotification(
  userId: string,
  payload: {
    title: string;
    body?: string;
    type?: string;
    category?: string;
    priority?: string;
    data?: unknown;
  },
) {
  const sql = await getSql();
  const id = uid("ntf");
  await sql.query(
    `insert into notifications (id, user_id, title, body, type, category, priority, data_json, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
    [
      id,
      userId,
      String(payload.title || "Notice").slice(0, 160),
      payload.body ? String(payload.body).slice(0, 2000) : null,
      payload.type || "info",
      payload.category || "system",
      payload.priority || "normal",
      payload.data ? toJson(payload.data) : null,
    ],
  );
  const rows = await sql.query(`select * from notifications where id = $1`, [id]);
  return rows[0];
}

export async function markNotificationRead(userId: string, id: string, all = false) {
  const sql = await getSql();
  if (all) {
    await sql.query(`update notifications set is_read = true where user_id = $1`, [userId]);
    return { ok: true as const };
  }
  await sql.query(`update notifications set is_read = true where user_id = $1 and id = $2`, [userId, id]);
  return { ok: true as const };
}

export async function dismissNotification(userId: string, id: string) {
  const sql = await getSql();
  await sql.query(`delete from notifications where user_id = $1 and id = $2`, [userId, id]);
  return { ok: true as const };
}

export async function listWorkspaces(userId: string) {
  const sql = await getSql();
  return sql.query(
    `select id, name, color, is_active, is_favorite, sort_order, state_json, created_at, updated_at
       from workspaces where user_id = $1 order by sort_order asc, created_at asc`,
    [userId],
  );
}

export async function createWorkspace(userId: string, name: string, color?: string) {
  const sql = await getSql();
  const clean = String(name || "").trim().slice(0, 48) || "Workspace";
  const count = await sql.query<{ c: number | string }>(`select count(*) as c from workspaces where user_id = $1`, [
    userId,
  ]);
  if (Number(count[0]?.c || 0) >= 12) fail(400, "Maximum of 12 workspaces");
  const id = uid("ws");
  await sql.query(
    `insert into workspaces (id, user_id, name, color, is_active, sort_order, created_at, updated_at)
     values ($1,$2,$3,$4,false,$5,now(),now())`,
    [id, userId, clean, color || "#06B6D4", Number(count[0]?.c || 0)],
  );
  const rows = await sql.query(`select * from workspaces where id = $1 and user_id = $2`, [id, userId]);
  return rows[0];
}

export async function updateWorkspace(
  userId: string,
  id: string,
  patch: { name?: string; color?: string; isFavorite?: boolean; stateJson?: string; sortOrder?: number },
) {
  const sql = await getSql();
  const cur = await sql.query(`select * from workspaces where id = $1 and user_id = $2`, [id, userId]);
  if (!cur[0]) fail(404, "Workspace not found");
  const name = patch.name?.trim().slice(0, 48);
  await sql.query(
    `update workspaces set
        name = coalesce($1, name),
        color = coalesce($2, color),
        is_favorite = coalesce($3, is_favorite),
        state_json = coalesce($4, state_json),
        sort_order = coalesce($5, sort_order),
        updated_at = now()
      where id = $6 and user_id = $7`,
    [name || null, patch.color || null, patch.isFavorite ?? null, patch.stateJson || null, patch.sortOrder ?? null, id, userId],
  );
  const rows = await sql.query(`select * from workspaces where id = $1`, [id]);
  return rows[0];
}

export async function switchWorkspace(userId: string, id: string) {
  const sql = await getSql();
  const cur = await sql.query(`select id from workspaces where id = $1 and user_id = $2`, [id, userId]);
  if (!cur[0]) fail(404, "Workspace not found");
  await sql.query(`update workspaces set is_active = false, updated_at = now() where user_id = $1`, [userId]);
  await sql.query(`update workspaces set is_active = true, updated_at = now() where id = $1 and user_id = $2`, [
    id,
    userId,
  ]);
  return listWorkspaces(userId);
}

export async function deleteWorkspace(userId: string, id: string) {
  const sql = await getSql();
  const all = await listWorkspaces(userId);
  if (all.length <= 1) fail(400, "Cannot delete the last workspace");
  const target = all.find((w) => (w as { id: string }).id === id);
  if (!target) fail(404, "Workspace not found");
  await sql.query(`delete from workspaces where id = $1 and user_id = $2`, [id, userId]);
  if ((target as { is_active: boolean }).is_active) {
    const next = all.find((w) => (w as { id: string }).id !== id);
    if (next) await switchWorkspace(userId, (next as { id: string }).id);
  }
  return { ok: true as const };
}

export async function saveLayout(userId: string, workspaceId: string, layout: unknown) {
  const sql = await getSql();
  const ws = await sql.query(`select id from workspaces where id = $1 and user_id = $2`, [workspaceId, userId]);
  if (!ws[0]) fail(404, "Workspace not found");
  await sql.query(
    `insert into window_layouts (user_id, workspace_id, layout_json, updated_at)
     values ($1,$2,$3,now())
     on conflict (user_id, workspace_id) do update set layout_json = excluded.layout_json, updated_at = now()`,
    [userId, workspaceId, toJson(layout)],
  );
  return { ok: true as const };
}

export async function loadLayout(userId: string, workspaceId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ layout_json: string }>(
    `select layout_json from window_layouts where user_id = $1 and workspace_id = $2`,
    [userId, workspaceId],
  );
  return fromJson<Json | null>(rows[0]?.layout_json, null);
}

export async function listNotes(userId: string, workspaceId?: string | null) {
  const sql = await getSql();
  if (workspaceId) {
    return sql.query(
      `select id, title, path, preview, tags_json, pinned, created_at, updated_at from notes
        where user_id = $1 and (workspace_id = $2 or workspace_id is null)
        order by pinned desc, updated_at desc`,
      [userId, workspaceId],
    );
  }
  return sql.query(
    `select id, title, path, preview, tags_json, pinned, created_at, updated_at from notes
      where user_id = $1 order by pinned desc, updated_at desc`,
    [userId],
  );
}

export async function getNote(userId: string, id: string) {
  const sql = await getSql();
  const rows = await sql.query(`select * from notes where id = $1 and user_id = $2`, [id, userId]);
  if (!rows[0]) fail(404, "Note not found");
  return rows[0];
}

export async function createNote(
  userId: string,
  input: { title?: string; content?: string; workspaceId?: string | null; tags?: string[] },
) {
  const sql = await getSql();
  const title = String(input.title || "Untitled").slice(0, 160);
  const content = String(input.content || "");
  const id = uid("note");
  const path = `/Home/Notes/${title.replace(/[<>:"/\\|?*]/g, "")}.md`.slice(0, 240);
  try {
    await vfs.mkdirp(userId, "/Home/Notes");
    await vfs.createFile(userId, "/Home/Notes", `${title.replace(/[<>:"/\\|?*]/g, "") || "Untitled"}.md`, content);
  } catch {
    // VFS write is best-effort; the note row is the source of truth if the name collides.
  }
  await sql.query(
    `insert into notes (id, user_id, workspace_id, title, path, content, preview, tags_json, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())`,
    [
      id,
      userId,
      input.workspaceId || null,
      title,
      path,
      content,
      content.slice(0, 180),
      toJson(input.tags || []),
    ],
  );
  return getNote(userId, id);
}

export async function updateNote(
  userId: string,
  id: string,
  patch: { title?: string; content?: string; pinned?: boolean; tags?: string[] },
) {
  const cur = (await getNote(userId, id)) as {
    content: string;
    title: string;
    path: string | null;
    pinned: boolean;
    tags_json: string | null;
  };
  const title = patch.title?.slice(0, 160) ?? cur.title;
  const content = patch.content ?? cur.content;
  const sql = await getSql();
  await sql.query(
    `update notes set title = $1, content = $2, preview = $3, pinned = coalesce($4, pinned), tags_json = coalesce($5, tags_json), updated_at = now()
      where id = $6 and user_id = $7`,
    [
      title,
      content,
      content.slice(0, 180),
      patch.pinned ?? null,
      patch.tags ? toJson(patch.tags) : null,
      id,
      userId,
    ],
  );
  if (cur.path && patch.content != null) {
    try {
      await vfs.writeFile(userId, cur.path, content);
    } catch {
      /* note still saved */
    }
  }
  return getNote(userId, id);
}

export async function deleteNote(userId: string, id: string) {
  const sql = await getSql();
  await sql.query(`delete from notes where id = $1 and user_id = $2`, [id, userId]);
  return { ok: true as const };
}

export async function listTodos(userId: string, workspaceId?: string | null) {
  const sql = await getSql();
  if (workspaceId) {
    return sql.query(
      `select * from todos where user_id = $1 and (workspace_id = $2 or workspace_id is null)
        order by case status when 'done' then 1 else 0 end, sort_order, created_at desc`,
      [userId, workspaceId],
    );
  }
  return sql.query(
    `select * from todos where user_id = $1
      order by case status when 'done' then 1 else 0 end, sort_order, created_at desc`,
    [userId],
  );
}

export async function createTodo(
  userId: string,
  input: {
    title: string;
    notes?: string;
    priority?: string;
    dueAt?: string | null;
    remindAt?: string | null;
    workspaceId?: string | null;
    parentId?: string | null;
    tags?: string[];
    recurrence?: string | null;
  },
) {
  const sql = await getSql();
  const id = uid("todo");
  const title = String(input.title || "").trim().slice(0, 200);
  if (!title) fail(400, "Title required");
  const priority = ["low", "medium", "high", "urgent"].includes(String(input.priority))
    ? input.priority
    : "medium";
  await sql.query(
    `insert into todos (id, user_id, workspace_id, parent_id, title, notes, status, priority, due_at, remind_at, recurrence, tags_json, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,'todo',$7,$8,$9,$10,$11,now(),now())`,
    [
      id,
      userId,
      input.workspaceId || null,
      input.parentId || null,
      title,
      input.notes || null,
      priority,
      input.dueAt || null,
      input.remindAt || null,
      input.recurrence || null,
      toJson(input.tags || []),
    ],
  );
  const rows = await sql.query(`select * from todos where id = $1`, [id]);
  return rows[0];
}

export async function updateTodo(
  userId: string,
  id: string,
  patch: { [key: string]: Json },
) {
  const sql = await getSql();
  const cur = await sql.query(`select * from todos where id = $1 and user_id = $2`, [id, userId]);
  if (!cur[0]) fail(404, "Task not found");
  const status = typeof patch.status === "string" ? patch.status : null;
  await sql.query(
    `update todos set
        title = coalesce($1, title),
        notes = coalesce($2, notes),
        status = coalesce($3, status),
        priority = coalesce($4, priority),
        due_at = case when $5 = true then $6 else due_at end,
        remind_at = case when $7 = true then $8 else remind_at end,
        tags_json = coalesce($9, tags_json),
        completed_at = case
          when $3 = 'done' then now()
          when $3 is not null then null
          else completed_at
        end,
        recurrence = coalesce($10, recurrence),
        sort_order = coalesce($11, sort_order),
        parent_id = case when $12 = true then $13 else parent_id end,
        updated_at = now()
      where id = $14 and user_id = $15`,
    [
      typeof patch.title === "string" ? patch.title.slice(0, 200) : null,
      typeof patch.notes === "string" ? patch.notes : null,
      status,
      typeof patch.priority === "string" ? patch.priority : null,
      patch.dueAt !== undefined,
      patch.dueAt === null ? null : typeof patch.dueAt === "string" ? patch.dueAt : null,
      patch.remindAt !== undefined,
      patch.remindAt === null ? null : typeof patch.remindAt === "string" ? patch.remindAt : null,
      Array.isArray(patch.tags) ? toJson(patch.tags) : null,
      typeof patch.recurrence === "string" || patch.recurrence === null
        ? (patch.recurrence as string | null)
        : null,
      typeof patch.sortOrder === "number" ? patch.sortOrder : null,
      patch.parentId !== undefined,
      patch.parentId === null ? null : typeof patch.parentId === "string" ? patch.parentId : null,
      id,
      userId,
    ],
  );
  const rows = await sql.query<{
    id: string;
    title: string;
    due_at: string | null;
    calendar_event_id: string | null;
  }>(`select * from todos where id = $1`, [id]);
  const row = rows[0];
  if (row?.calendar_event_id && (typeof patch.title === "string" || typeof patch.dueAt === "string")) {
    try {
      await sql.query(
        `update calendar_events set
            title = coalesce($1, title),
            starts_at = coalesce($2, starts_at),
            updated_at = now()
          where id = $3 and user_id = $4`,
        [
          typeof patch.title === "string" ? patch.title : null,
          typeof patch.dueAt === "string" ? patch.dueAt : null,
          row.calendar_event_id,
          userId,
        ],
      );
    } catch {
      /* linked event may be gone */
    }
  }
  return row;
}

export async function deleteTodo(userId: string, id: string) {
  const sql = await getSql();
  try {
    const rows = await sql.query<{ calendar_event_id: string | null }>(
      `select calendar_event_id from todos where id = $1 and user_id = $2`,
      [id, userId],
    );
    const linked = rows[0]?.calendar_event_id;
    if (linked) {
      await sql.query(`delete from calendar_events where id = $1 and user_id = $2`, [linked, userId]);
    }
  } catch {
    /* calendar_event_id may be missing until migrate */
  }
  await sql.query(`delete from todos where user_id = $1 and (id = $2 or parent_id = $2)`, [userId, id]);
  return { ok: true as const };
}

export async function listEvents(userId: string, from: string, to: string) {
  const sql = await getSql();
  return sql.query(
    `select * from calendar_events
      where user_id = $1 and starts_at < $2 and coalesce(ends_at, starts_at) >= $3
      order by starts_at asc`,
    [userId, to, from],
  );
}

export async function createEvent(
  userId: string,
  input: {
    title: string;
    description?: string;
    location?: string;
    startsAt: string;
    endsAt?: string | null;
    allDay?: boolean;
    workspaceId?: string | null;
    todoId?: string | null;
    remindMinutes?: number | null;
    timezone?: string | null;
    recurrence?: string | null;
  },
) {
  const sql = await getSql();
  const title = String(input.title || "").trim().slice(0, 200);
  if (!title) fail(400, "Title required");
  if (!input.startsAt) fail(400, "Start time required");
  const id = uid("evt");
  await sql.query(
    `insert into calendar_events
      (id, user_id, workspace_id, title, description, location, starts_at, ends_at, all_day, todo_id, remind_minutes, timezone, recurrence, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now())`,
    [
      id,
      userId,
      input.workspaceId || null,
      title,
      input.description || null,
      input.location || null,
      input.startsAt,
      input.endsAt || null,
      Boolean(input.allDay),
      input.todoId || null,
      input.remindMinutes ?? null,
      input.timezone || null,
      input.recurrence || null,
    ],
  );
  if (input.todoId) {
    try {
      await sql.query(
        `update todos set calendar_event_id = $1, due_at = coalesce(due_at, $2), updated_at = now() where id = $3 and user_id = $4`,
        [id, input.startsAt, input.todoId, userId],
      );
    } catch {
      /* calendar_event_id may be missing until migrate */
    }
  }
  const rows = await sql.query(`select * from calendar_events where id = $1`, [id]);
  return rows[0];
}

export async function updateEvent(userId: string, id: string, patch: { [key: string]: Json }) {
  const sql = await getSql();
  const cur = await sql.query(`select id from calendar_events where id = $1 and user_id = $2`, [id, userId]);
  if (!cur[0]) fail(404, "Event not found");
  await sql.query(
    `update calendar_events set
        title = coalesce($1, title),
        description = coalesce($2, description),
        location = coalesce($3, location),
        starts_at = coalesce($4, starts_at),
        ends_at = case when $5 = true then $6 else ends_at end,
        all_day = coalesce($7, all_day),
        remind_minutes = case when $8 = true then $9 else remind_minutes end,
        recurrence = coalesce($10, recurrence),
        timezone = coalesce($11, timezone),
        todo_id = case when $12 = true then $13 else todo_id end,
        updated_at = now()
      where id = $14 and user_id = $15`,
    [
      typeof patch.title === "string" ? patch.title : null,
      typeof patch.description === "string" ? patch.description : null,
      typeof patch.location === "string" ? patch.location : null,
      typeof patch.startsAt === "string" ? patch.startsAt : null,
      patch.endsAt !== undefined,
      patch.endsAt === null ? null : typeof patch.endsAt === "string" ? patch.endsAt : null,
      typeof patch.allDay === "boolean" ? patch.allDay : null,
      patch.remindMinutes !== undefined,
      patch.remindMinutes === null ? null : typeof patch.remindMinutes === "number" ? patch.remindMinutes : null,
      typeof patch.recurrence === "string" ? patch.recurrence : null,
      typeof patch.timezone === "string" ? patch.timezone : null,
      patch.todoId !== undefined,
      patch.todoId === null ? null : typeof patch.todoId === "string" ? patch.todoId : null,
      id,
      userId,
    ],
  );
  const rows = await sql.query<{
    id: string;
    todo_id: string | null;
    title: string;
    starts_at: string;
  }>(`select * from calendar_events where id = $1`, [id]);
  const ev = rows[0];
  if (ev?.todo_id && (typeof patch.title === "string" || typeof patch.startsAt === "string")) {
    try {
      await sql.query(
        `update todos set
            title = coalesce($1, title),
            due_at = coalesce($2, due_at),
            updated_at = now()
          where id = $3 and user_id = $4`,
        [
          typeof patch.title === "string" ? patch.title : null,
          typeof patch.startsAt === "string" ? patch.startsAt : null,
          ev.todo_id,
          userId,
        ],
      );
    } catch {
      /* linked task may be gone */
    }
  }
  return ev;
}

export async function deleteEvent(userId: string, id: string) {
  const sql = await getSql();
  try {
    await sql.query(`update todos set calendar_event_id = null where calendar_event_id = $1 and user_id = $2`, [
      id,
      userId,
    ]);
  } catch {
    /* column may be missing */
  }
  await sql.query(`delete from calendar_events where id = $1 and user_id = $2`, [id, userId]);
  return { ok: true as const };
}

export async function listJobs(userId: string, status?: string | null) {
  const sql = await getSql();
  if (status) {
    return sql.query(`select * from jobs where user_id = $1 and status = $2 order by created_at desc limit 100`, [
      userId,
      status,
    ]);
  }
  return sql.query(`select * from jobs where user_id = $1 order by created_at desc limit 100`, [userId]);
}

export async function enqueueJob(
  userId: string,
  input: { type: string; title?: string; payload?: Json; runAfter?: string | null },
) {
  const sql = await getSql();
  const id = uid("job");
  await sql.query(
    `insert into jobs (id, user_id, type, title, status, progress, payload_json, run_after, created_at, updated_at)
     values ($1,$2,$3,$4,'pending',0,$5,$6,now(),now())`,
    [
      id,
      userId,
      String(input.type || "generic").slice(0, 64),
      String(input.title || input.type || "Job").slice(0, 160),
      input.payload ? toJson(input.payload) : null,
      input.runAfter || null,
    ],
  );
  await drainJobs(userId);
  const rows = await sql.query(`select * from jobs where id = $1`, [id]);
  return rows[0];
}

export async function cancelJob(userId: string, id: string) {
  const sql = await getSql();
  const rows = await sql.query<{ status: string }>(`select status from jobs where id = $1 and user_id = $2`, [
    id,
    userId,
  ]);
  if (!rows[0]) fail(404, "Job not found");
  if (!["pending", "running"].includes(rows[0].status)) {
    const cur = await sql.query(`select * from jobs where id = $1`, [id]);
    return cur[0];
  }
  await sql.query(
    `update jobs set status = 'cancelled', updated_at = now(), completed_at = now() where id = $1 and user_id = $2`,
    [id, userId],
  );
  const cur = await sql.query(`select * from jobs where id = $1`, [id]);
  return cur[0];
}

type JobRow = {
  id: string;
  user_id: string;
  type: string;
  payload_json: string | null;
  attempts: number | string;
  max_attempts: number | string;
  status: string;
};

async function runJob(job: JobRow) {
  const sql = await getSql();
  const payload = fromJson<{ [key: string]: Json }>(job.payload_json, {});
  if (job.type === "empty_trash") return vfs.emptyTrash(job.user_id);
  if (job.type === "inspect_folder") {
    const path = String(payload.path || "/Home");
    const tree = await vfs.getTree(job.user_id, path);
    const files = tree.filter((n) => !n.isDir);
    const folders = tree.filter((n) => n.isDir);
    return {
      path,
      files: files.length,
      folders: folders.length,
      bytes: files.reduce((s, n) => s + n.size, 0),
    };
  }
  if (job.type === "organize_report") {
    const path = String(payload.path || "/Home");
    const items = await vfs.listDirectory(job.user_id, path);
    const byExt: Record<string, number> = {};
    for (const n of items) {
      if (n.isDir) continue;
      const ext = n.name.includes(".") ? n.name.slice(n.name.lastIndexOf(".") + 1).toLowerCase() : "";
      byExt[ext] = (byExt[ext] || 0) + 1;
    }
    return { path, count: items.length, byExt };
  }
  if (job.type === "export_backup") {
    return exportBackup(job.user_id);
  }
  if (job.type === "zip_create") {
    const extra = await import("./vfs-extra.server");
    const paths = Array.isArray(payload.paths) ? payload.paths.map(String) : [];
    const dest = String(payload.dest || "/Home/Documents");
    const name = String(payload.name || "archive.zip");
    return extra.createZipArchive(job.user_id, paths, dest, name, async (p) => {
      await sql.query(`update jobs set progress = $1, updated_at = now() where id = $2`, [p, job.id]);
    });
  }
  if (job.type === "zip_extract") {
    const extra = await import("./vfs-extra.server");
    const path = String(payload.path || "");
    const dest = String(payload.dest || "/Home/Downloads");
    return extra.extractZipArchive(job.user_id, path, dest, async (p) => {
      await sql.query(`update jobs set progress = $1, updated_at = now() where id = $2`, [p, job.id]);
    });
  }
  if (job.type === "bulk_move") {
    const extra = await import("./vfs-extra.server");
    const paths = Array.isArray(payload.paths) ? payload.paths.map(String) : [];
    return extra.bulkMove(job.user_id, paths, String(payload.dest || "/Home"), (payload.onConflict as "overwrite" | "rename" | "skip") || "rename");
  }
  if (job.type === "generic") return { ok: true, note: "Completed" };
  fail(400, `Unknown job type: ${job.type}`);
}

export async function drainJobs(userId?: string) {
  const sql = await getSql();
  const pending = userId
    ? await sql.query<JobRow>(
        `select * from jobs where user_id = $1 and status = 'pending' and (run_after is null or run_after <= now())
          order by created_at asc limit 8`,
        [userId],
      )
    : await sql.query<JobRow>(
        `select * from jobs where status = 'pending' and (run_after is null or run_after <= now())
          order by created_at asc limit 8`,
      );
  for (const job of pending) {
    const attempts = Number(job.attempts || 0) + 1;
    await sql.query(
      `update jobs set status = 'running', progress = 0.1, attempts = $1, updated_at = now() where id = $2`,
      [attempts, job.id],
    );
    try {
      const result = await runJob(job);
      await sql.query(
        `update jobs set status = 'completed', progress = 1, result_json = $1, updated_at = now(), completed_at = now() where id = $2`,
        [toJson(result), job.id],
      );
      await createNotification(job.user_id, {
        title: "Job completed",
        body: `${job.type} finished successfully`,
        type: "success",
        category: "jobs",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Job failed";
      const max = Number(job.max_attempts || 3);
      if (attempts < max) {
        await sql.query(
          `update jobs set status = 'pending', error = $1, updated_at = now(), run_after = now() + interval '20 seconds' where id = $2`,
          [message, job.id],
        );
      } else {
        await sql.query(
          `update jobs set status = 'failed', error = $1, updated_at = now(), completed_at = now() where id = $2`,
          [message, job.id],
        );
        await createNotification(job.user_id, {
          title: "Job failed",
          body: message,
          type: "error",
          category: "jobs",
        });
      }
    }
  }
}

export async function audit(
  userId: string | null,
  action: string,
  resource?: string,
  resourceId?: string,
  details?: unknown,
) {
  const sql = await getSql();
  await sql.query(
    `insert into audit_logs (id, user_id, action, resource, resource_id, details_json, created_at)
     values ($1,$2,$3,$4,$5,$6,now())`,
    [uid("aud"), userId, action, resource || null, resourceId || null, details ? toJson(details) : null],
  );
}

export async function listAudit(userId: string, limit = 80) {
  const sql = await getSql();
  return sql.query(
    `select id, action, resource, resource_id, details_json, created_at from audit_logs
      where user_id = $1 order by created_at desc limit $2`,
    [userId, Math.min(limit, 200)],
  );
}

export async function listCapabilities(userId: string) {
  const sql = await getSql();
  return sql.query(`select id, scope, resource, granted_at, expires_at from capabilities where user_id = $1`, [
    userId,
  ]);
}

export async function hasCapability(userId: string, scope: string, resource: string | null = null) {
  const sql = await getSql();
  const profile = await sql.query<{ role: string }>(`select role from os_profiles where user_id = $1`, [userId]);
  if (profile[0]?.role === "admin") return true;
  const rows = await sql.query<{ resource: string | null }>(
    `select resource from capabilities
      where user_id = $1 and scope = $2 and (expires_at is null or expires_at > now())`,
    [userId, scope],
  );
  if (!rows.length) return false;
  if (resource == null) return true;
  return rows.some((r) => {
    if (!r.resource || r.resource === "/") return true;
    return resource === r.resource || resource.startsWith(r.resource + "/");
  });
}

export async function assertCapability(userId: string, scope: string, resource: string | null = null) {
  if (!(await hasCapability(userId, scope, resource))) {
    fail(403, `Capability denied: ${scope}`, "CAPABILITY_DENIED");
  }
}

export async function listInstalledApps(userId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ app_id: string; enabled: boolean | string | number; version: string | null }>(
    `select app_id, enabled, version from apps_installed where user_id = $1`,
    [userId],
  );
  const byId = new Map(rows.map((r) => [r.app_id, r]));
  return APP_CATALOG.map((app) => {
    const inst = byId.get(app.id);
    return {
      ...app,
      installed: Boolean(inst),
      enabled: inst ? inst.enabled === true || inst.enabled === "t" || inst.enabled === 1 || inst.enabled === "true" : true,
    };
  });
}

export async function setAppEnabled(userId: string, appId: string, enabled: boolean) {
  if (!APP_CATALOG.some((a) => a.id === appId)) fail(404, "Unknown application");
  const sql = await getSql();
  await sql.query(
    `insert into apps_installed (id, user_id, app_id, version, enabled, installed_at)
     values ($1,$2,$3,$4,$5,now())
     on conflict (user_id, app_id) do update set enabled = excluded.enabled`,
    [uid("app"), userId, appId, OS_VERSION, enabled],
  );
  await audit(userId, enabled ? "app.enable" : "app.disable", "app", appId);
  return listInstalledApps(userId);
}

export async function unifiedSearch(userId: string, query: string) {
  const extra = await import("./platform-extra.server");
  return extra.rankedSearch(userId, query);
}

export async function searchHistory(userId: string) {
  const sql = await getSql();
  return sql.query(
    `select query, max(created_at) as created_at from search_history where user_id = $1 group by query order by max(created_at) desc limit 20`,
    [userId],
  );
}

export async function exportBackup(userId: string) {
  const sql = await getSql();
  const files = await vfs.getTree(userId, "/");
  const contents: Array<{ path: string; content: string; encoding: string; isDir: boolean }> = [];
  for (const f of files) {
    if (f.isDir) {
      contents.push({ path: f.path, content: "", encoding: "utf8", isDir: true });
      continue;
    }
    try {
      const full = await vfs.readFile(userId, f.path);
      contents.push({
        path: full.path,
        content: full.content,
        encoding: full.encoding,
        isDir: false,
      });
    } catch {
      contents.push({ path: f.path, content: "", encoding: "utf8", isDir: false });
    }
  }
  const [settings, notes, todos, events, workspaces, memories, favorites, shares, comments, tags, folders, aliases] =
    await Promise.all([
      getSettings(userId),
      sql.query(`select title, content, pinned, tags_json, folder_path from notes where user_id = $1`, [userId]),
      sql.query(
        `select title, notes, status, priority, due_at, remind_at, recurrence, tags_json, parent_id, sort_order from todos where user_id = $1`,
        [userId],
      ),
      sql.query(
        `select title, description, location, starts_at, ends_at, all_day, timezone, recurrence, remind_minutes, todo_id from calendar_events where user_id = $1`,
        [userId],
      ),
      sql.query(`select name, color, sort_order, settings_json from workspaces where user_id = $1`, [userId]),
      sql.query(`select kind, content, source from ai_memories where user_id = $1`, [userId]),
      sql.query(`select path, title from favorites where user_id = $1`, [userId]),
      sql.query(`select path, title, expires_at from share_grants where user_id = $1 and revoked_at is null`, [userId]),
      sql.query(`select path, body, created_at from file_comments where user_id = $1`, [userId]),
      sql.query(`select path, tag from file_tags where user_id = $1`, [userId]),
      sql.query(`select name, path, parent_id from note_folders where user_id = $1`, [userId]),
      sql.query(`select name, command from shell_aliases where user_id = $1`, [userId]),
    ]);
  return {
    version: OS_VERSION,
    exportedAt: new Date().toISOString(),
    files: contents,
    settings,
    notes,
    todos,
    events,
    workspaces,
    memories,
    favorites,
    shares,
    comments,
    tags,
    folders,
    aliases,
  };
}

export async function importBackup(userId: string, backup: { [key: string]: Json }, overwrite = false) {
  if (!backup || typeof backup !== "object") fail(400, "Invalid backup");
  const files = Array.isArray(backup.files) ? backup.files : [];
  if (overwrite) {
    // Do not wipe system folders; only import missing or overwrite file contents.
  }
  for (const f of files as Array<{ path: string; content?: string; encoding?: string; isDir?: boolean }>) {
    if (!f?.path) continue;
    if (f.isDir) {
      try {
        await vfs.mkdirp(userId, f.path);
      } catch {
        /* skip */
      }
      continue;
    }
    const parent = f.path.slice(0, f.path.lastIndexOf("/")) || "/Home";
    const name = f.path.slice(f.path.lastIndexOf("/") + 1);
    try {
      await vfs.mkdirp(userId, parent);
      const existing = await vfs.getNodeByPath(userId, f.path);
      if (existing && !existing.isDir) {
        if (overwrite) await vfs.writeFile(userId, f.path, f.content || "", f.encoding === "base64" ? "base64" : "utf8");
      } else if (!existing) {
        await vfs.createFile(userId, parent, name, f.content || "", f.encoding === "base64" ? "base64" : "utf8");
      }
    } catch {
      /* skip unreadable entries */
    }
  }
  if (backup.settings && typeof backup.settings === "object") {
    await setSettings(userId, backup.settings as Partial<OsSettings>);
  }
  if (Array.isArray(backup.notes)) {
    for (const n of backup.notes as Array<{ title?: string; content?: string; pinned?: boolean; tags_json?: string }>) {
      if (!n?.title) continue;
      try {
        await createNote(userId, {
          title: String(n.title),
          content: String(n.content || ""),
          tags: fromJson(n.tags_json || "[]", []),
        });
      } catch {
        /* skip */
      }
    }
  }
  if (Array.isArray(backup.todos)) {
    for (const t of backup.todos as Array<{
      title?: string;
      notes?: string;
      priority?: string;
      due_at?: string;
      recurrence?: string;
    }>) {
      if (!t?.title) continue;
      try {
        await createTodo(userId, {
          title: String(t.title),
          notes: t.notes,
          priority: t.priority,
          dueAt: t.due_at || null,
          recurrence: t.recurrence || null,
        });
      } catch {
        /* skip */
      }
    }
  }
  if (Array.isArray(backup.events)) {
    for (const e of backup.events as Array<{ title?: string; starts_at?: string; ends_at?: string; all_day?: boolean }>) {
      if (!e?.title || !e.starts_at) continue;
      try {
        await createEvent(userId, {
          title: String(e.title),
          startsAt: String(e.starts_at),
          endsAt: e.ends_at || null,
          allDay: Boolean(e.all_day),
        });
      } catch {
        /* skip */
      }
    }
  }
  if (Array.isArray(backup.memories)) {
    for (const m of backup.memories as Array<{ content?: string; kind?: string; source?: string }>) {
      if (!m?.content) continue;
      try {
        await addMemory(userId, String(m.content), m.kind || "explicit", m.source);
      } catch {
        /* skip */
      }
    }
  }
  if (Array.isArray(backup.favorites)) {
    for (const f of backup.favorites as Array<{ path?: string; title?: string }>) {
      if (!f?.path) continue;
      try {
        await vfs.setFavorite(userId, String(f.path), f.title, true);
      } catch {
        /* skip */
      }
    }
  }
  if (Array.isArray(backup.tags)) {
    const extra = await import("./vfs-extra.server");
    const byPath = new Map<string, string[]>();
    for (const t of backup.tags as Array<{ path?: string; tag?: string }>) {
      if (!t?.path || !t.tag) continue;
      const arr = byPath.get(t.path) || [];
      arr.push(t.tag);
      byPath.set(t.path, arr);
    }
    for (const [path, tags] of byPath) {
      try {
        await extra.setTags(userId, path, tags);
      } catch {
        /* skip */
      }
    }
  }
  if (Array.isArray(backup.folders)) {
    const extra = await import("./platform-extra.server");
    for (const f of backup.folders as Array<{ name?: string }>) {
      if (!f?.name) continue;
      try {
        await extra.createNoteFolder(userId, String(f.name));
      } catch {
        /* skip */
      }
    }
  }
  if (Array.isArray(backup.comments)) {
    const extra = await import("./vfs-extra.server");
    for (const c of backup.comments as Array<{ path?: string; body?: string }>) {
      if (!c?.path || !c.body) continue;
      try {
        await extra.addComment(userId, String(c.path), String(c.body));
      } catch {
        /* skip */
      }
    }
  }
  if (Array.isArray(backup.aliases)) {
    const extra = await import("./platform-extra.server");
    for (const a of backup.aliases as Array<{ name?: string; command?: string }>) {
      if (!a?.name || !a.command) continue;
      try {
        await extra.setAlias(userId, String(a.name), String(a.command));
      } catch {
        /* skip */
      }
    }
  }
  await audit(userId, "backup.import", "backup", undefined, { overwrite, files: files.length });
  return { ok: true as const, imported: files.length };
}

export async function listMemories(userId: string) {
  const sql = await getSql();
  return sql.query(`select id, kind, content, source, created_at from ai_memories where user_id = $1 order by created_at desc`, [
    userId,
  ]);
}

export async function addMemory(userId: string, content: string, kind = "explicit", source?: string) {
  const sql = await getSql();
  const id = uid("mem");
  const text = String(content || "").trim().slice(0, 2000);
  if (!text) fail(400, "Memory content required");
  await sql.query(
    `insert into ai_memories (id, user_id, kind, content, source, created_at) values ($1,$2,$3,$4,$5,now())`,
    [id, userId, kind, text, source || null],
  );
  const rows = await sql.query(`select * from ai_memories where id = $1`, [id]);
  return rows[0];
}

export async function deleteMemory(userId: string, id: string) {
  const sql = await getSql();
  await sql.query(`delete from ai_memories where id = $1 and user_id = $2`, [id, userId]);
  return { ok: true as const };
}

export async function clipboardPush(userId: string, text: string) {
  const sql = await getSql();
  const t = String(text || "").slice(0, 8000);
  if (!t.trim()) fail(400, "Empty clipboard item");
  await sql.query(`insert into clipboard_items (id, user_id, text, created_at) values ($1,$2,$3,now())`, [
    uid("clip"),
    userId,
    t,
  ]);
  await sql.query(
    `delete from clipboard_items where id in (
       select id from clipboard_items where user_id = $1 order by created_at desc offset 40
     )`,
    [userId],
  );
  return listClipboard(userId);
}

export async function listClipboard(userId: string) {
  const sql = await getSql();
  return sql.query(`select id, text, created_at from clipboard_items where user_id = $1 order by created_at desc limit 40`, [
    userId,
  ]);
}

export async function clearClipboard(userId: string) {
  const sql = await getSql();
  await sql.query(`delete from clipboard_items where user_id = $1`, [userId]);
  return { ok: true as const };
}

export async function dueReminders(userId: string) {
  const sql = await getSql();
  const todos = await sql.query(
    `select id, title, remind_at from todos
      where user_id = $1 and status <> 'done' and remind_at is not null and remind_at <= now()
      limit 20`,
    [userId],
  );
  let events: Array<{ id: string; title: string; starts_at: string; remind_minutes: number | null }> = [];
  try {
    events = await sql.query(
      `select id, title, starts_at, remind_minutes from calendar_events
        where user_id = $1 and remind_minutes is not null and last_reminded_at is null
          and starts_at - (remind_minutes || ' minutes')::interval <= now()
          and starts_at >= now() - interval '1 hour'
        limit 20`,
      [userId],
    );
  } catch {
    events = [];
  }
  return { todos, events };
}

export async function systemHealth() {
  const sql = await getSql();
  const one = await sql.query(`select 1 as ok`);
  return {
    ok: Boolean(one[0]),
    version: OS_VERSION,
    name: "Trosmos OS",
    time: new Date().toISOString(),
    aiConfigured: Boolean(process.env.XAI_API_KEY),
  };
}
