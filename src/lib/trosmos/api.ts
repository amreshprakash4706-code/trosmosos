import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { TrosmosError } from "./errors";
import type { OsSettings } from "./core";
import type { Json } from "./types";

async function withUser<T>(
  context: { userId: string },
  fn: (userId: string) => Promise<T>,
): Promise<Json> {
  try {
    const { ensureBootstrapped } = await import("./platform.server");
    await ensureBootstrapped(context.userId, {});
    const out = await fn(context.userId);
    return JSON.parse(JSON.stringify(out ?? null)) as Json;
  } catch (err) {
    if (err instanceof TrosmosError) throw err;
    const anyErr = err as { status?: number; message?: string };
    if (anyErr?.status && anyErr.message) throw err;
    throw err;
  }
}

/** Narrow a server-fn JSON payload to a concrete client type. */
export function decode<T>(value: unknown, fallback?: T): T {
  if ((value === null || value === undefined) && fallback !== undefined) return fallback;
  return value as T;
}

export const bootOs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const platform = await import("./platform.server");
    const vfs = await import("./vfs.server");
    await platform.ensureBootstrapped(context.userId, {});
    await platform.drainJobs(context.userId);
    const [profile, settings, workspaces, notifications, apps, stats, health, favorites, recent, capabilities, ai] =
      await Promise.all([
        platform.getProfile(context.userId),
        platform.getSettings(context.userId),
        platform.listWorkspaces(context.userId),
        platform.listNotifications(context.userId),
        platform.listInstalledApps(context.userId),
        vfs.getStorageStats(context.userId),
        platform.systemHealth(),
        vfs.listFavorites(context.userId),
        vfs.listRecent(context.userId, 20),
        platform.listCapabilities(context.userId),
        import("./ai.server").then((m) => m.aiStatus()),
      ]);
    const reminders = await platform.dueReminders(context.userId);
    try {
      const extra = await import("./platform-extra.server");
      await extra.fireDueReminders(context.userId);
    } catch {
      /* reminder table columns may not exist until migrate */
    }
    return JSON.parse(
      JSON.stringify({
        profile,
        settings,
        workspaces,
        notifications,
        apps,
        stats,
        health,
        favorites,
        recent,
        capabilities,
        ai,
        reminders,
      }),
    ) as Json;
  });

export const listDirFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path?: string; sort?: string; q?: string }) => input ?? {})
  .handler(async ({ context, data }) =>
    withUser(context, async (userId) => {
      const vfs = await import("./vfs.server");
      return vfs.listDirectory(userId, data.path || "/Home", { sort: data.sort, q: data.q });
    }),
  );

export const readFileFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, async (userId) => {
      const vfs = await import("./vfs.server");
      const { touchRecent } = vfs;
      const file = await vfs.readFile(userId, data.path);
      await touchRecent(userId, "file", file.id, file.name, file.path);
      return file;
    }),
  );

export const createFolderFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { parent: string; name: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, async (userId) => {
      const vfs = await import("./vfs.server");
      const platform = await import("./platform.server");
      const node = await vfs.createFolder(userId, data.parent, data.name);
      await platform.audit(userId, "vfs.mkdir", "file", node.id, { path: node.path });
      return node;
    }),
  );

export const createFileFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { parent: string; name: string; content?: string; encoding?: "utf8" | "base64" }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, async (userId) => {
      const vfs = await import("./vfs.server");
      const platform = await import("./platform.server");
      const node = await vfs.createFile(userId, data.parent, data.name, data.content || "", data.encoding || "utf8");
      await platform.audit(userId, "vfs.create", "file", node.id, { path: node.path });
      return node;
    }),
  );

export const writeFileFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string; content: string; encoding?: "utf8" | "base64" }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, async (userId) => {
      const vfs = await import("./vfs.server");
      return vfs.writeFile(userId, data.path, data.content, data.encoding);
    }),
  );

export const renameFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string; name: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.renameNode(userId, data.path, data.name))),
  );

export const moveFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string; destination: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.moveNode(userId, data.path, data.destination))),
  );

export const copyFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string; destination: string; name?: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./vfs.server").then((m) => m.copyNode(userId, data.path, data.destination, data.name || null)),
    ),
  );

export const trashFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.trashNode(userId, data.path))),
  );

export const restoreFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.restoreNode(userId, data.path))),
  );

export const removeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.permanentlyDelete(userId, data.path))),
  );

export const listTrashFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => withUser(context, (userId) => import("./vfs.server").then((m) => m.listTrash(userId))));

export const emptyTrashFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.emptyTrash(userId))),
  );

export const searchFilesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { query: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.searchFiles(userId, data.query))),
  );

export const treeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { root?: string }) => input ?? {})
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.getTree(userId, data.root || "/Home"))),
  );

export const statsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.getStorageStats(userId))),
  );

export const versionsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.listVersions(userId, data.path))),
  );

export const restoreVersionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string; version: number }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.restoreVersion(userId, data.path, data.version))),
  );

export const favoriteFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string; title?: string; on?: boolean }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./vfs.server").then((m) => m.setFavorite(userId, data.path, data.title, data.on !== false)),
    ),
  );

export const listFavoritesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./vfs.server").then((m) => m.listFavorites(userId))),
  );

export const recentFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => withUser(context, (userId) => import("./vfs.server").then((m) => m.listRecent(userId))));

export const getSettingsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.getSettings(userId))),
  );

export const setSettingsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Partial<OsSettings>) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.setSettings(userId, data))),
  );

export const updateProfileFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { displayName?: string; timezone?: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.updateProfile(userId, data))),
  );

export const listNotificationsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.listNotifications(userId))),
  );

export const markNotifFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; all?: boolean }) => input ?? {})
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform.server").then((m) => m.markNotificationRead(userId, data.id || "", Boolean(data.all))),
    ),
  );

export const dismissNotifFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.dismissNotification(userId, data.id))),
  );

export const workspacesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.listWorkspaces(userId))),
  );

export const createWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; color?: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform.server").then((m) => m.createWorkspace(userId, data.name, data.color)),
    ),
  );

export const switchWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.switchWorkspace(userId, data.id))),
  );

export const updateWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; name?: string; color?: string; isFavorite?: boolean; stateJson?: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => {
      const { id, ...patch } = data;
      return import("./platform.server").then((m) => m.updateWorkspace(userId, id, patch));
    }),
  );

export const deleteWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.deleteWorkspace(userId, data.id))),
  );

export const saveLayoutFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string; layout: Json }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform.server").then((m) => m.saveLayout(userId, data.workspaceId, data.layout)),
    ),
  );

export const loadLayoutFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.loadLayout(userId, data.workspaceId))),
  );

export const listNotesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId?: string | null }) => input ?? {})
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.listNotes(userId, data.workspaceId))),
  );

export const getNoteFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.getNote(userId, data.id))),
  );

export const createNoteFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { title?: string; content?: string; workspaceId?: string | null; tags?: string[] }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.createNote(userId, data))),
  );

export const updateNoteFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; title?: string; content?: string; pinned?: boolean; tags?: string[] }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => {
      const { id, ...patch } = data;
      return import("./platform.server").then((m) => m.updateNote(userId, id, patch));
    }),
  );

export const deleteNoteFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.deleteNote(userId, data.id))),
  );

export const listTodosFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId?: string | null }) => input ?? {})
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.listTodos(userId, data.workspaceId))),
  );

export const createTodoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      title: string;
      notes?: string;
      priority?: string;
      dueAt?: string | null;
      remindAt?: string | null;
      workspaceId?: string | null;
      parentId?: string | null;
      tags?: string[];
      recurrence?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.createTodo(userId, data))),
  );

export const updateTodoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      id: string;
      title?: string;
      notes?: string;
      status?: string;
      priority?: string;
      dueAt?: string | null;
      remindAt?: string | null;
      tags?: string[];
      recurrence?: string | null;
      sortOrder?: number;
      parentId?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => {
      const { id, ...patch } = data;
      return import("./platform.server").then((m) => m.updateTodo(userId, id, patch as { [key: string]: Json }));
    }),
  );

export const deleteTodoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.deleteTodo(userId, data.id))),
  );

export const listEventsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { from: string; to: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.listEvents(userId, data.from, data.to))),
  );

export const createEventFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
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
    }) => input,
  )
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.createEvent(userId, data))),
  );

export const updateEventFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      id: string;
      title?: string;
      description?: string;
      location?: string;
      startsAt?: string;
      endsAt?: string | null;
      allDay?: boolean;
      remindMinutes?: number | null;
      recurrence?: string | null;
      timezone?: string | null;
      todoId?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => {
      const { id, ...patch } = data;
      return import("./platform.server").then((m) => m.updateEvent(userId, id, patch as { [key: string]: Json }));
    }),
  );

export const deleteEventFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.deleteEvent(userId, data.id))),
  );

export const listJobsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, async (userId) => {
      const platform = await import("./platform.server");
      await platform.drainJobs(userId);
      return platform.listJobs(userId);
    }),
  );

export const enqueueJobFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { type: string; title?: string; payload?: Json }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.enqueueJob(userId, data))),
  );

export const cancelJobFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.cancelJob(userId, data.id))),
  );

export const searchFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { query: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.unifiedSearch(userId, data.query))),
  );

export const searchHistoryFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.searchHistory(userId))),
  );

export const exportBackupFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.exportBackup(userId))),
  );

export const importBackupFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { backup: { [key: string]: Json }; overwrite?: boolean }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform.server").then((m) => m.importBackup(userId, data.backup, Boolean(data.overwrite))),
    ),
  );

export const listAppsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.listInstalledApps(userId))),
  );

export const setAppEnabledFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { appId: string; enabled: boolean }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform.server").then((m) => m.setAppEnabled(userId, data.appId, data.enabled)),
    ),
  );

export const activityFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, async (userId) => {
      const platform = await import("./platform.server");
      const vfs = await import("./vfs.server");
      const [audit, recent, jobs] = await Promise.all([
        platform.listAudit(userId),
        vfs.listRecent(userId),
        platform.listJobs(userId),
      ]);
      return { audit, recent, jobs };
    }),
  );

export const memoriesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.listMemories(userId))),
  );

export const addMemoryFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { content: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.addMemory(userId, data.content))),
  );

export const deleteMemoryFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.deleteMemory(userId, data.id))),
  );

export const clipboardListFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.listClipboard(userId))),
  );

export const clipboardPushFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { text: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.clipboardPush(userId, data.text))),
  );

export const clipboardClearFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform.server").then((m) => m.clearClipboard(userId))),
  );

export const runShellFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { command: string; cwd: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./shell.server").then((m) => m.runShell(userId, data.command, data.cwd))),
  );

export const aiChatFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { message: string; conversationId?: string | null }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./ai.server").then((m) => m.chat(userId, data))),
  );

export const aiConfirmFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { invocationId: string; allow: boolean }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./ai.server").then((m) => m.confirmInvocation(userId, data.invocationId, data.allow)),
    ),
  );

export const aiConversationsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./ai.server").then((m) => m.listConversations(userId))),
  );

export const aiConversationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./ai.server").then((m) => m.getConversation(userId, data.id))),
  );

export const aiDeleteConvFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./ai.server").then((m) => m.deleteConversation(userId, data.id))),
  );

export const aiStatusFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { aiStatus } = await import("./ai.server");
    return aiStatus();
  });

export const healthFn = createServerFn({ method: "GET" }).handler(async () => {
  const { systemHealth } = await import("./platform.server");
  return systemHealth();
});

export const bulkTrashFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { paths: string[] }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.bulkTrash(userId, data.paths))),
  );

export const bulkRestoreFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { paths: string[] }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.bulkRestore(userId, data.paths))),
  );

export const bulkMoveFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { paths: string[]; destination: string; onConflict?: "overwrite" | "rename" | "skip" }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./vfs-extra.server").then((m) =>
        m.bulkMove(userId, data.paths, data.destination, data.onConflict || "rename"),
      ),
    ),
  );

export const bulkCopyFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { paths: string[]; destination: string; onConflict?: "overwrite" | "rename" | "skip" }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./vfs-extra.server").then((m) =>
        m.bulkCopy(userId, data.paths, data.destination, data.onConflict || "rename"),
      ),
    ),
  );

export const createShareFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string; title?: string; expiresAt?: string | null }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, async (userId) => {
      const extra = await import("./vfs-extra.server");
      const platform = await import("./platform.server");
      const share = await extra.createShare(userId, data.path, { title: data.title, expiresAt: data.expiresAt });
      await platform.audit(userId, "share.create", "file", share.id, { path: data.path });
      return share;
    }),
  );

export const listSharesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.listShares(userId))),
  );

export const revokeShareFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, async (userId) => {
      const extra = await import("./vfs-extra.server");
      const platform = await import("./platform.server");
      const out = await extra.revokeShare(userId, data.id);
      await platform.audit(userId, "share.revoke", "file", data.id);
      return out;
    }),
  );

export const resolveShareFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, async (userId) => {
      const extra = await import("./vfs-extra.server");
      const platform = await import("./platform.server");
      const out = await extra.resolveShare(userId, data.token);
      await platform.audit(userId, "share.access", "file", out.grant.id, { path: out.grant.path });
      return out;
    }),
  );

export const listCommentsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.listComments(userId, data.path))),
  );

export const addCommentFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string; body: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.addComment(userId, data.path, data.body))),
  );

export const deleteCommentFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.deleteComment(userId, data.id))),
  );

export const setTagsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string; tags: string[] }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.setTags(userId, data.path, data.tags))),
  );

export const listTagsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path?: string } | undefined) => input ?? {})
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.listTags(userId, data.path))),
  );

export const filesByTagFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { tag: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.filesByTag(userId, data.tag))),
  );

export const thumbnailFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.thumbnailFor(userId, data.path))),
  );

export const zipCreateFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { paths: string[]; dest?: string; name?: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform.server").then((m) =>
        m.enqueueJob(userId, {
          type: "zip_create",
          title: `ZIP ${data.name || "archive"}`,
          payload: { paths: data.paths, dest: data.dest || "/Home/Documents", name: data.name || "archive.zip" },
        }),
      ),
    ),
  );

export const zipExtractFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string; dest?: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform.server").then((m) =>
        m.enqueueJob(userId, {
          type: "zip_extract",
          title: `Extract ${data.path}`,
          payload: { path: data.path, dest: data.dest || "/Home/Downloads" },
        }),
      ),
    ),
  );

export const noteFoldersFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform-extra.server").then((m) => m.listNoteFolders(userId))),
  );

export const createNoteFolderFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; parentId?: string | null }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform-extra.server").then((m) => m.createNoteFolder(userId, data.name, data.parentId)),
    ),
  );

export const deleteNoteFolderFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform-extra.server").then((m) => m.deleteNoteFolder(userId, data.id))),
  );

export const moveNoteFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; folderId: string | null }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform-extra.server").then((m) => m.moveNoteToFolder(userId, data.id, data.folderId)),
    ),
  );

export const noteLinksFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, async (userId) => {
      const extra = await import("./platform-extra.server");
      const [backlinks, outgoing] = await Promise.all([
        extra.noteBacklinks(userId, data.id),
        extra.noteOutgoingLinks(userId, data.id),
      ]);
      return { backlinks, outgoing };
    }),
  );

export const exportNoteFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform-extra.server").then((m) => m.exportNoteMarkdown(userId, data.id))),
  );

export const sessionsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform-extra.server").then((m) => m.listSessions(userId))),
  );

export const revokeSessionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform-extra.server").then((m) => m.revokeSession(userId, data.id))),
  );

export const deleteAccountFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { confirm: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform-extra.server").then((m) => m.deleteAccount(userId, data.confirm))),
  );

export const saveDesktopFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      workspaceId: string;
      icons?: Array<{ id: string; appId?: string; path?: string; kind: "app" | "file"; x: number; y: number; label?: string }>;
      dock?: string[];
      wallpaper?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => {
      const { workspaceId, ...payload } = data;
      return import("./platform-extra.server").then((m) => m.saveDesktopLayout(userId, workspaceId, payload));
    }),
  );

export const loadDesktopFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform-extra.server").then((m) => m.loadDesktopLayout(userId, data.workspaceId)),
    ),
  );

export const applyMutationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { op: string; idempotencyKey: string; payload: Json }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform-extra.server").then((m) => m.applyMutation(userId, data))),
  );

export const completeRecurringFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform-extra.server").then((m) => m.completeRecurringTodo(userId, data.id))),
  );

export const filterTodosFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      status?: string;
      priority?: string;
      tag?: string;
      due?: "overdue" | "today" | "upcoming" | "none";
      workspaceId?: string | null;
    }) => input ?? {},
  )
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./platform-extra.server").then((m) => m.filterTodos(userId, data))),
  );

export const listEventsExpandedFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { from: string; to: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform-extra.server").then((m) => m.expandEventRange(userId, data.from, data.to)),
    ),
  );

export const clearSearchHistoryFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform-extra.server").then((m) => m.clearSearchHistory(userId))),
  );

export const aiUpdateConvFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; title?: string; pinned?: boolean }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => {
      const { id, ...patch } = data;
      return import("./platform-extra.server").then((m) => m.updateConversation(userId, id, patch));
    }),
  );

export const shortcutsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { SHORTCUTS } = await import("./shortcuts");
  return SHORTCUTS;
});

export const bulkDeleteFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { paths: string[] }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.bulkDelete(userId, data.paths))),
  );

export const bulkTagFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { paths: string[]; tags: string[] }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.bulkTag(userId, data.paths, data.tags))),
  );

export const zipListFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { path: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) => import("./vfs-extra.server").then((m) => m.listZipEntries(userId, data.path))),
  );

export const notificationActionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; action: "dismiss" | "read" | "snooze" | "complete" }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform-extra.server").then((m) => m.notificationAction(userId, data.id, data.action)),
    ),
  );

export const updateMemoryFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; content: string }) => input)
  .handler(async ({ context, data }) =>
    withUser(context, (userId) =>
      import("./platform-extra.server").then((m) => m.updateMemory(userId, data.id, data.content)),
    ),
  );

export const pendingMutationsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    withUser(context, (userId) => import("./platform-extra.server").then((m) => m.listPendingMutations(userId))),
  );

