/**
 * AI / App Tool Executor — Trosmos OS 5.0
 * Single authorization boundary for all tool calls.
 * Mutating tools require confirmation unless already confirmed.
 */
import { getDb } from '../db.js';
import { uid } from '../utils/id.js';
import { normalizePath, safeName } from '../utils/id.js';
import * as vfs from './vfs.service.js';
import { assertCapability, SCOPES } from './capability.service.js';
import { audit } from './auth.service.js';
import { config } from '../config.js';

const TOOL_REGISTRY = {
  list_directory: {
    capability: SCOPES.VFS_READ,
    requiresConfirmation: false,
    mutating: false,
    handler(userId, args) {
      return vfs.listDirectory(userId, args.path || '/Home');
    },
  },
  create_folder: {
    capability: SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    handler(userId, args) {
      return vfs.createFolder(userId, args.parent || '/Home', args.name);
    },
  },
  create_file: {
    capability: SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    handler(userId, args) {
      return vfs.createFile(userId, args.parent || '/Home/Documents', args.name, args.content || '');
    },
  },
  read_file: {
    capability: SCOPES.VFS_READ,
    requiresConfirmation: false,
    mutating: false,
    handler(userId, args) {
      const file = vfs.readFile(userId, args.path);
      return { path: file.path, content: file.content, size: file.size };
    },
  },
  write_file: {
    capability: SCOPES.VFS_WRITE,
    requiresConfirmation: true,
    mutating: true,
    handler(userId, args) {
      return vfs.writeFile(userId, args.path, args.content || '');
    },
  },
  search_files: {
    capability: SCOPES.VFS_READ,
    requiresConfirmation: false,
    mutating: false,
    handler(userId, args) {
      return vfs.searchFiles(userId, args.query || '');
    },
  },
  get_storage_stats: {
    capability: SCOPES.VFS_READ,
    requiresConfirmation: false,
    mutating: false,
    handler(userId) {
      return vfs.getStorageStats(userId);
    },
  },
  get_system_info: {
    capability: SCOPES.AI_TOOL,
    requiresConfirmation: false,
    mutating: false,
    handler() {
      return {
        name: config.name,
        version: config.version,
        aiEnabled: config.aiEnabled,
      };
    },
  },
  // Client-only — never executed server-side
  open_app: { clientOnly: true },
  close_app: { clientOnly: true },
};

function validateArgs(toolName, args) {
  const a = args && typeof args === 'object' ? { ...args } : {};
  if (a.path) a.path = normalizePath(a.path);
  if (a.parent) a.parent = normalizePath(a.parent);
  if (a.name) a.name = safeName(a.name);
  if (a.content != null && typeof a.content !== 'string') a.content = String(a.content);
  if (a.content && Buffer.byteLength(a.content, 'utf8') > config.maxFileSizeBytes) {
    const err = new Error('Content exceeds maximum file size');
    err.status = 413;
    throw err;
  }
  return a;
}

function resourceFor(toolName, args) {
  return args.path || args.parent || '/';
}

function buildPreview(toolName, args) {
  switch (toolName) {
    case 'write_file':
      return { action: 'overwrite', path: args.path, bytes: Buffer.byteLength(args.content || '', 'utf8') };
    case 'create_file':
      return { action: 'create', parent: args.parent, name: args.name };
    case 'create_folder':
      return { action: 'mkdir', parent: args.parent, name: args.name };
    default:
      return { action: toolName, ...args };
  }
}

/**
 * Execute a tool under the given user.
 * Returns either a normal result or a confirmation_required payload.
 */
export async function executeTool(userId, toolName, rawArgs, opts = {}) {
  const { confirmationId = null, correlationId = null, req = null } = opts;
  const def = TOOL_REGISTRY[toolName];

  if (!def) {
    return { ok: false, error: `Unknown tool: ${toolName}`, code: 'UNKNOWN_TOOL' };
  }

  if (def.clientOnly) {
    return { ok: true, result: { clientAction: toolName, args: rawArgs }, client: true };
  }

  let args;
  try {
    args = validateArgs(toolName, rawArgs);
  } catch (e) {
    return { ok: false, error: e.message, code: e.code || 'VALIDATION_ERROR' };
  }

  try {
    assertCapability(userId, def.capability, resourceFor(toolName, args));
  } catch (e) {
    audit(userId, 'ai.tool.denied', toolName, null, { args, reason: e.message }, req);
    return { ok: false, error: e.message, code: 'CAPABILITY_DENIED' };
  }

  // Confirmation gate for mutating tools
  if (def.requiresConfirmation && !confirmationId) {
    const id = uid('inv');
    getDb().prepare(
      `INSERT INTO ai_tool_invocations
         (id, user_id, tool_name, args_json, status, requires_confirmation, correlation_id)
       VALUES (?, ?, ?, ?, 'pending', 1, ?)`
    ).run(id, userId, toolName, JSON.stringify(args), correlationId || null);

    return {
      ok: true,
      type: 'confirmation_required',
      invocationId: id,
      tool: toolName,
      preview: buildPreview(toolName, args),
    };
  }

  if (confirmationId) {
    const inv = getDb().prepare(
      `SELECT * FROM ai_tool_invocations WHERE id = ? AND user_id = ? AND status = 'pending'`
    ).get(confirmationId, userId);
    if (!inv) {
      return { ok: false, error: 'Invalid or expired confirmation', code: 'CONFIRMATION_INVALID' };
    }
    // Mark confirmed then execute
    getDb().prepare(`UPDATE ai_tool_invocations SET status = 'confirmed' WHERE id = ?`).run(confirmationId);
  }

  try {
    const result = await Promise.resolve(def.handler(userId, args));
    const invId = confirmationId || uid('inv');
    getDb().prepare(
      `INSERT INTO ai_tool_invocations
         (id, user_id, tool_name, args_json, result_json, status, requires_confirmation, correlation_id, executed_at)
       VALUES (?, ?, ?, ?, ?, 'executed', ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         result_json = excluded.result_json,
         status = 'executed',
         executed_at = datetime('now')`
    ).run(
      invId,
      userId,
      toolName,
      JSON.stringify(args),
      JSON.stringify(result),
      def.requiresConfirmation ? 1 : 0,
      correlationId || null
    );

    audit(userId, 'ai.tool', toolName, null, { args, ok: true }, req);
    return { ok: true, result };
  } catch (e) {
    audit(userId, 'ai.tool', toolName, null, { args, ok: false, error: e.message }, req);
    return { ok: false, error: e.message || 'Tool execution failed', code: e.code || 'TOOL_FAILED' };
  }
}

export function getToolDeclarations() {
  return [
    {
      name: 'open_app',
      description: 'Open or focus an application window',
      parameters: {
        type: 'OBJECT',
        properties: {
          app: {
            type: 'STRING',
            description: 'ai | files | browser | settings | app-store | task-manager | terminal | calculator | notes | clock | clipboard | help',
          },
        },
        required: ['app'],
      },
    },
    {
      name: 'close_app',
      description: 'Close an application window',
      parameters: {
        type: 'OBJECT',
        properties: { app: { type: 'STRING' } },
        required: ['app'],
      },
    },
    {
      name: 'list_directory',
      description: 'List files and folders in a directory',
      parameters: {
        type: 'OBJECT',
        properties: { path: { type: 'STRING', description: 'e.g. /Home/Documents' } },
        required: ['path'],
      },
    },
    {
      name: 'create_folder',
      description: 'Create a new folder (requires confirmation)',
      parameters: {
        type: 'OBJECT',
        properties: {
          parent: { type: 'STRING' },
          name: { type: 'STRING' },
        },
        required: ['parent', 'name'],
      },
    },
    {
      name: 'create_file',
      description: 'Create a new text or markdown file (requires confirmation)',
      parameters: {
        type: 'OBJECT',
        properties: {
          parent: { type: 'STRING' },
          name: { type: 'STRING' },
          content: { type: 'STRING' },
        },
        required: ['parent', 'name'],
      },
    },
    {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'OBJECT',
        properties: { path: { type: 'STRING' } },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Overwrite content of an existing file (requires confirmation)',
      parameters: {
        type: 'OBJECT',
        properties: {
          path: { type: 'STRING' },
          content: { type: 'STRING' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'search_files',
      description: 'Search files by name or path',
      parameters: {
        type: 'OBJECT',
        properties: { query: { type: 'STRING' } },
        required: ['query'],
      },
    },
    {
      name: 'get_storage_stats',
      description: 'Get current storage usage for the user',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'get_system_info',
      description: 'Get basic system information',
      parameters: { type: 'OBJECT', properties: {} },
    },
  ];
}

export { TOOL_REGISTRY };
