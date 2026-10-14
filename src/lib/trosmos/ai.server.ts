import { getSql } from "@/lib/db";
import { OS_VERSION, fromJson, toJson, uid } from "./core";
import { fail } from "./errors";
import * as vfs from "./vfs.server";
import * as platform from "./platform.server";
import type { Json } from "./types";

export type ToolDef = {
  name: string;
  description: string;
  capability: string;
  requiresConfirmation: boolean;
  mutating: boolean;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
};

export const TOOLS: ToolDef[] = [
  {
    name: "list_directory",
    description: "List files and folders in a VFS directory",
    capability: platform.SCOPES.VFS_READ,
    requiresConfirmation: false,
    mutating: false,
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Directory path, default /Home" } },
    },
  },
  {
    name: "read_file",
    description: "Read a text file from the VFS",
    capability: platform.SCOPES.VFS_READ,
    requiresConfirmation: false,
    mutating: false,
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "create_file",
    description: "Create a new file",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: {
        parent: { type: "string" },
        name: { type: "string" },
        content: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_folder",
    description: "Create a folder",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: { parent: { type: "string" }, name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "write_file",
    description: "Overwrite a file's contents",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search the VFS by name, path, or text content",
    capability: platform.SCOPES.VFS_READ,
    requiresConfirmation: false,
    mutating: false,
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "trash_file",
    description: "Move a file or folder to Trash",
    capability: platform.SCOPES.VFS_DELETE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "restore_file",
    description: "Restore an item from Trash",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "rename_file",
    description: "Rename a file or folder",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, name: { type: "string" } },
      required: ["path", "name"],
    },
  },
  {
    name: "move_file",
    description: "Move a file or folder into another directory",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, destination: { type: "string" } },
      required: ["path", "destination"],
    },
  },
  {
    name: "copy_file",
    description: "Copy a file or folder",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        destination: { type: "string" },
        name: { type: "string" },
      },
      required: ["path", "destination"],
    },
  },
  {
    name: "inspect_folder",
    description: "Summarize a folder (counts and bytes)",
    capability: platform.SCOPES.VFS_READ,
    requiresConfirmation: false,
    mutating: false,
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "get_storage_stats",
    description: "Get VFS storage usage for this user",
    capability: platform.SCOPES.VFS_READ,
    requiresConfirmation: false,
    mutating: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_system_info",
    description: "Trosmos version and AI availability",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: false,
    mutating: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_notes",
    description: "List workspace notes",
    capability: platform.SCOPES.VFS_READ,
    requiresConfirmation: false,
    mutating: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_note",
    description: "Create a note",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: { title: { type: "string" }, content: { type: "string" } },
      required: ["title"],
    },
  },
  {
    name: "list_todos",
    description: "List tasks",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: false,
    mutating: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_todo",
    description: "Create a task",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        priority: { type: "string" },
        dueAt: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_todo",
    description: "Update a task status or fields",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string" },
        title: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "search_os",
    description: "Unified search across files, notes, tasks, apps",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: false,
    mutating: false,
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "list_workspaces",
    description: "List the user's workspaces",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: false,
    mutating: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_events",
    description: "List calendar events in an ISO date range",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: false,
    mutating: false,
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO start" },
        to: { type: "string", description: "ISO end" },
      },
    },
  },
  {
    name: "create_event",
    description: "Create a calendar event",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        startsAt: { type: "string" },
        endsAt: { type: "string" },
        location: { type: "string" },
      },
      required: ["title", "startsAt"],
    },
  },
  {
    name: "notify_user",
    description: "Create a Trosmos notification",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: { title: { type: "string" }, body: { type: "string" } },
      required: ["title"],
    },
  },
  {
    name: "remember",
    description: "Store an explicit memory the user asked to keep",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: { content: { type: "string" } },
      required: ["content"],
    },
  },
  {
    name: "filter_tasks",
    description: "Filter tasks by status, priority, tag, or due window",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: false,
    mutating: false,
    parameters: {
      type: "object",
      properties: {
        status: { type: "string" },
        priority: { type: "string" },
        tag: { type: "string" },
        due: { type: "string", description: "overdue | today | upcoming | none" },
      },
    },
  },
  {
    name: "batch_trash",
    description: "Move several files to Trash",
    capability: platform.SCOPES.VFS_DELETE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: { paths: { type: "string", description: "JSON array of paths" } },
      required: ["paths"],
    },
  },
  {
    name: "batch_move",
    description: "Move several files into a destination folder",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: {
        paths: { type: "string", description: "JSON array of paths" },
        destination: { type: "string" },
      },
      required: ["paths", "destination"],
    },
  },
  {
    name: "list_tags",
    description: "List file tags",
    capability: platform.SCOPES.VFS_READ,
    requiresConfirmation: false,
    mutating: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "batch_copy",
    description: "Copy several files into a destination folder",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: {
        paths: { type: "string", description: "JSON array of paths" },
        destination: { type: "string" },
      },
      required: ["paths", "destination"],
    },
  },
  {
    name: "batch_tag",
    description: "Apply tags to several files",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: {
        paths: { type: "string", description: "JSON array of paths" },
        tags: { type: "string", description: "Comma-separated tags" },
      },
      required: ["paths", "tags"],
    },
  },
  {
    name: "calendar_range",
    description: "List calendar events in a range, expanding recurrences",
    capability: platform.SCOPES.AI_TOOL,
    requiresConfirmation: false,
    mutating: false,
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO start" },
        to: { type: "string", description: "ISO end" },
      },
    },
  },
  {
    name: "zip_files",
    description: "Create a ZIP archive of several VFS paths as a background job",
    capability: platform.SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    parameters: {
      type: "object",
      properties: {
        paths: { type: "string", description: "JSON array of paths" },
        dest: { type: "string" },
        name: { type: "string" },
      },
      required: ["paths"],
    },
  },
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

function openaiTools() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function executeTool(
  userId: string,
  toolName: string,
  args: { [key: string]: Json },
  opts: { confirmed?: boolean; conversationId?: string | null } = {},
) {
  const tool = TOOL_BY_NAME[toolName];
  if (!tool) fail(400, `Unknown tool: ${toolName}`);
  await platform.assertCapability(userId, tool.capability, typeof args.path === "string" ? args.path : "/");
  const settings = await platform.getSettings(userId);
  const needsConfirm = tool.requiresConfirmation && settings.aiConfirmMutations && !opts.confirmed;
  if (needsConfirm) {
    const sql = await getSql();
    const id = uid("inv");
    await sql.query(
      `insert into ai_tool_invocations
        (id, user_id, conversation_id, tool_name, args_json, status, requires_confirmation, created_at)
       values ($1,$2,$3,$4,$5,'pending',true,now())`,
      [id, userId, opts.conversationId || null, toolName, toJson(args)],
    );
    return {
      status: "pending_confirmation" as const,
      invocationId: id,
      tool: toolName,
      args,
      summary: describeTool(toolName, args),
    };
  }
  const result = await runTool(userId, toolName, args);
  const sql = await getSql();
  await sql.query(
    `insert into ai_tool_invocations
      (id, user_id, conversation_id, tool_name, args_json, result_json, status, requires_confirmation, created_at, executed_at)
     values ($1,$2,$3,$4,$5,$6,'executed',$7,now(),now())`,
    [
      uid("inv"),
      userId,
      opts.conversationId || null,
      toolName,
      toJson(args),
      toJson(result),
      tool.requiresConfirmation,
    ],
  );
  await platform.audit(userId, `ai.tool.${toolName}`, "tool", toolName, { args });
  return { status: "executed" as const, tool: toolName, result };
}

function describeTool(name: string, args: { [key: string]: Json }): string {
  if (name === "create_file") return `Create file ${args.name} in ${args.parent || "/Home/Documents"}`;
  if (name === "write_file") return `Overwrite ${args.path}`;
  if (name === "trash_file") return `Move ${args.path} to Trash`;
  if (name === "create_folder") return `Create folder ${args.name}`;
  if (name === "create_note") return `Create note “${args.title}”`;
  if (name === "create_todo") return `Create task “${args.title}”`;
  return `${name} ${JSON.stringify(args).slice(0, 120)}`;
}

async function runTool(userId: string, name: string, args: { [key: string]: Json }) {
  switch (name) {
    case "list_directory":
      return vfs.listDirectory(userId, String(args.path || "/Home"));
    case "read_file": {
      const file = await vfs.readFile(userId, String(args.path));
      const content = file.encoding === "base64" ? "[binary content omitted]" : file.content.slice(0, 20000);
      return { path: file.path, size: file.size, content };
    }
    case "create_file":
      return vfs.createFile(
        userId,
        String(args.parent || "/Home/Documents"),
        String(args.name),
        String(args.content || ""),
      );
    case "create_folder":
      return vfs.createFolder(userId, String(args.parent || "/Home"), String(args.name));
    case "write_file":
      return vfs.writeFile(userId, String(args.path), String(args.content || ""));
    case "search_files":
      return vfs.searchFiles(userId, String(args.query || ""));
    case "trash_file":
      return vfs.trashNode(userId, String(args.path));
    case "restore_file":
      return vfs.restoreNode(userId, String(args.path));
    case "rename_file":
      return vfs.renameNode(userId, String(args.path), String(args.name));
    case "move_file":
      return vfs.moveNode(userId, String(args.path), String(args.destination));
    case "copy_file":
      return vfs.copyNode(userId, String(args.path), String(args.destination), args.name ? String(args.name) : null);
    case "inspect_folder": {
      const path = String(args.path || "/Home");
      const tree = await vfs.getTree(userId, path);
      return {
        path,
        nodes: tree.length,
        files: tree.filter((n) => !n.isDir).length,
        folders: tree.filter((n) => n.isDir).length,
      };
    }
    case "get_storage_stats":
      return vfs.getStorageStats(userId);
    case "get_system_info":
      return {
        name: "Trosmos OS",
        version: OS_VERSION,
        aiEnabled: Boolean(process.env.XAI_API_KEY),
        model: "grok-4.5",
      };
    case "list_notes":
      return platform.listNotes(userId);
    case "create_note":
      return platform.createNote(userId, {
        title: String(args.title || args.name || "Untitled"),
        content: String(args.content || ""),
      });
    case "list_todos":
      return platform.listTodos(userId);
    case "create_todo":
      return platform.createTodo(userId, {
        title: String(args.title),
        priority: typeof args.priority === "string" ? args.priority : undefined,
        dueAt: typeof args.dueAt === "string" ? args.dueAt : null,
      });
    case "update_todo":
      return platform.updateTodo(userId, String(args.id), {
        status: args.status,
        title: args.title,
      });
    case "search_os":
      return platform.unifiedSearch(userId, String(args.query));
    case "list_workspaces":
      return platform.listWorkspaces(userId);
    case "list_events": {
      const from = typeof args.from === "string" ? args.from : new Date().toISOString();
      const to =
        typeof args.to === "string"
          ? args.to
          : new Date(Date.now() + 7 * 86400000).toISOString();
      const extra = await import("./platform-extra.server");
      return extra.expandEventRange(userId, from, to);
    }
    case "create_event":
      return platform.createEvent(userId, {
        title: String(args.title),
        startsAt: String(args.startsAt),
        endsAt: typeof args.endsAt === "string" ? args.endsAt : null,
        location: typeof args.location === "string" ? args.location : undefined,
      });
    case "notify_user":
      return platform.createNotification(userId, {
        title: String(args.title),
        body: args.body ? String(args.body) : undefined,
        category: "ai",
      });
    case "remember":
      return platform.addMemory(userId, String(args.content), "explicit", "ai");
    case "filter_tasks": {
      const extra = await import("./platform-extra.server");
      return extra.filterTodos(userId, {
        status: typeof args.status === "string" ? args.status : undefined,
        priority: typeof args.priority === "string" ? args.priority : undefined,
        tag: typeof args.tag === "string" ? args.tag : undefined,
        due:
          args.due === "overdue" || args.due === "today" || args.due === "upcoming" || args.due === "none"
            ? args.due
            : undefined,
      });
    }
    case "batch_trash": {
      const extra = await import("./vfs-extra.server");
      const paths = parsePathList(args.paths);
      return extra.bulkTrash(userId, paths);
    }
    case "batch_move": {
      const extra = await import("./vfs-extra.server");
      const paths = parsePathList(args.paths);
      return extra.bulkMove(userId, paths, String(args.destination || "/Home"));
    }
    case "list_tags": {
      const extra = await import("./vfs-extra.server");
      return extra.listTags(userId);
    }
    case "batch_copy": {
      const extra = await import("./vfs-extra.server");
      const paths = parsePathList(args.paths);
      return extra.bulkCopy(userId, paths, String(args.destination || "/Home"));
    }
    case "batch_tag": {
      const extra = await import("./vfs-extra.server");
      const paths = parsePathList(args.paths);
      const tags =
        typeof args.tags === "string"
          ? args.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : parsePathList(args.tags);
      return extra.bulkTag(userId, paths, tags);
    }
    case "calendar_range": {
      const extra = await import("./platform-extra.server");
      const from = typeof args.from === "string" ? args.from : new Date().toISOString();
      const to =
        typeof args.to === "string" ? args.to : new Date(Date.now() + 7 * 86400000).toISOString();
      return extra.expandEventRange(userId, from, to);
    }
    case "zip_files": {
      const paths = parsePathList(args.paths);
      return platform.enqueueJob(userId, {
        type: "zip_create",
        title: `ZIP ${typeof args.name === "string" ? args.name : "archive"}`,
        payload: {
          paths,
          dest: String(args.dest || "/Home/Documents"),
          name: String(args.name || "archive.zip"),
        },
      });
    }
    default:
      fail(400, `Unhandled tool ${name}`);
  }
}

function parsePathList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.map(String);
    } catch {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export async function confirmInvocation(userId: string, invocationId: string, allow: boolean) {
  const sql = await getSql();
  const rows = await sql.query<{
    id: string;
    tool_name: string;
    args_json: string;
    status: string;
    conversation_id: string | null;
  }>(`select * from ai_tool_invocations where id = $1 and user_id = $2`, [invocationId, userId]);
  const row = rows[0];
  if (!row) fail(404, "Invocation not found");
  if (row.status !== "pending") fail(409, "Invocation is not pending");
  if (!allow) {
    await sql.query(`update ai_tool_invocations set status = 'denied', executed_at = now() where id = $1`, [
      invocationId,
    ]);
    return { status: "denied" as const, invocationId };
  }
  const args = fromJson<{ [key: string]: Json }>(row.args_json, {});
  const out = await executeTool(userId, row.tool_name, args, {
    confirmed: true,
    conversationId: row.conversation_id,
  });
  await sql.query(
    `update ai_tool_invocations set status = 'executed', result_json = $1, executed_at = now() where id = $2`,
    [toJson(out), invocationId],
  );
  return out;
}

const rateBuckets = new Map<string, number[]>();

function rateLimit(userId: string) {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 20;
  const prev = (rateBuckets.get(userId) || []).filter((t) => now - t < windowMs);
  if (prev.length >= max) fail(429, "AI rate limit exceeded", "AI_RATE_LIMIT");
  prev.push(now);
  rateBuckets.set(userId, prev);
}

const SYSTEM = `You are Trosmos AI, the copilot of Trosmos OS ${OS_VERSION} — a real multi-user web operating environment.

Help the user operate their Trosmos session using tools. Prefer taking action via tools over merely describing it. Never invent private user data, fake metrics, or claim an action succeeded unless a tool result confirms it.

Destructive or mutating tools are held for user confirmation. After confirmation, you will receive the real result.

This is not a host operating system. The Terminal is a Trosmos shell. You cannot access the user's physical machine, camera, or arbitrary websites beyond Trosmos.

Keep replies concise. Use light, precise language. If a capability is limited, say so honestly.`;

export async function listConversations(userId: string) {
  const sql = await getSql();
  try {
    return await sql.query(
      `select id, title, pinned, created_at, updated_at from ai_conversations where user_id = $1 order by pinned desc, updated_at desc limit 60`,
      [userId],
    );
  } catch {
    return sql.query(
      `select id, title, created_at, updated_at from ai_conversations where user_id = $1 order by updated_at desc limit 60`,
      [userId],
    );
  }
}

export async function getConversation(userId: string, id: string) {
  const sql = await getSql();
  const conv = await sql.query(`select * from ai_conversations where id = $1 and user_id = $2`, [id, userId]);
  if (!conv[0]) fail(404, "Conversation not found");
  const messages = await sql.query(
    `select id, role, content, tool_name, created_at from ai_messages where conversation_id = $1 order by created_at asc`,
    [id],
  );
  return { conversation: conv[0], messages };
}

export async function deleteConversation(userId: string, id: string) {
  const sql = await getSql();
  await sql.query(`delete from ai_conversations where id = $1 and user_id = $2`, [id, userId]);
  return { ok: true as const };
}

export async function chat(userId: string, input: { message: string; conversationId?: string | null }) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    fail(503, "AI is not configured in this environment. Trosmos AI needs an xAI key on the server.", "AI_NOT_CONFIGURED");
  }
  const message = String(input.message || "").trim();
  if (!message) fail(400, "message required");
  if (message.length > 12000) fail(400, "message too long");
  rateLimit(userId);

  const sql = await getSql();
  let conversationId = input.conversationId || null;
  if (conversationId) {
    const ok = await sql.query(`select id from ai_conversations where id = $1 and user_id = $2`, [
      conversationId,
      userId,
    ]);
    if (!ok[0]) conversationId = null;
  }
  if (!conversationId) {
    conversationId = uid("cnv");
    const title = message.slice(0, 72);
    await sql.query(
      `insert into ai_conversations (id, user_id, title, created_at, updated_at) values ($1,$2,$3,now(),now())`,
      [conversationId, userId, title],
    );
  }

  await sql.query(
    `insert into ai_messages (id, conversation_id, user_id, role, content, created_at) values ($1,$2,$3,'user',$4,now())`,
    [uid("msg"), conversationId, userId, message],
  );

  const history = await sql.query<{ role: string; content: string }>(
    `select role, content from ai_messages where conversation_id = $1 order by created_at desc limit 16`,
    [conversationId],
  );
  history.reverse();

  const memories = await sql.query<{ content: string }>(
    `select content from ai_memories where user_id = $1 order by created_at desc limit 8`,
    [userId],
  );
  const memoryBlock = memories.length
    ? `\n\nExplicit memories the user asked to keep:\n${memories.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM + memoryBlock },
    ...history
      .filter((h) => h.role === "user" || h.role === "assistant")
      .map((h) => ({ role: h.role, content: h.content.slice(0, 8000) })),
  ];

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      messages,
      tools: openaiTools(),
      tool_choice: "auto",
      max_tokens: 1200,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    fail(503, `xAI API error ${res.status}${errText ? "" : ""}`, "AI_PROVIDER");
  }

  const body = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };
  const choice = body.choices?.[0]?.message;
  const toolCalls = choice?.tool_calls || [];
  const pending: Array<{ [key: string]: Json }> = [];
  const executed: Array<{ [key: string]: Json }> = [];
  const outcomes: Array<{ call: (typeof toolCalls)[number]; out: { [key: string]: Json } }> = [];

  for (const call of toolCalls.slice(0, 6)) {
    let args: { [key: string]: Json } = {};
    try {
      args = JSON.parse(call.function.arguments || "{}") as { [key: string]: Json };
    } catch {
      args = {};
    }
    const out = await executeTool(userId, call.function.name, args, { conversationId });
    const packed = JSON.parse(JSON.stringify(out)) as { [key: string]: Json };
    outcomes.push({ call, out: packed });
    if (out.status === "pending_confirmation") pending.push(packed);
    else executed.push(packed);
  }

  let text = (choice?.content || "").trim();
  if (executed.length && !pending.length && outcomes.length) {
    const followMessages = [
      ...messages,
      {
        role: "assistant",
        content: choice?.content || "",
        tool_calls: toolCalls,
      },
      ...outcomes.map(({ call, out }) => ({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(out).slice(0, 8000),
      })),
    ];
    const follow = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        messages: followMessages,
        max_tokens: 900,
        temperature: 0.4,
      }),
    });
    if (follow.ok) {
      const followBody = (await follow.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const followText = (followBody.choices?.[0]?.message?.content || "").trim();
      if (followText) text = followText;
    }
  }
  if (!text && executed.length && !pending.length) {
    text = "Done. I ran the requested tools.";
  }
  if (!text && pending.length) {
    text = "I need your confirmation before I make those changes.";
  }
  if (!text) text = "I'm here. Ask me to inspect files, notes, or tasks.";

  await sql.query(
    `insert into ai_messages (id, conversation_id, user_id, role, content, metadata_json, created_at)
     values ($1,$2,$3,'assistant',$4,$5,now())`,
    [uid("msg"), conversationId, userId, text, toJson({ pending, executed })],
  );
  await sql.query(`update ai_conversations set updated_at = now() where id = $1`, [conversationId]);

  return {
    conversationId,
    text,
    pending,
    executed,
  };
}

export async function aiStatus() {
  return {
    configured: Boolean(process.env.XAI_API_KEY),
    model: "grok-4.5",
    tools: TOOLS.map((t) => ({
      name: t.name,
      mutating: t.mutating,
      requiresConfirmation: t.requiresConfirmation,
    })),
  };
}
