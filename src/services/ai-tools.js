/**
 * Trosmos OS — AI Tool definitions & executor
 * Controlled interface: AI never gets raw DOM or unrestricted access.
 */

import { eventBus } from '../core/event-bus.js';

/** Tool schemas for Gemini function calling */
export const AI_TOOLS = [
  {
    name: 'open_app',
    description: 'Open or focus an application window',
    parameters: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          enum: ['ai', 'files', 'browser', 'settings', 'app-store', 'task-manager'],
          description: 'Application to open'
        }
      },
      required: ['app']
    }
  },
  {
    name: 'close_app',
    description: 'Close an application window',
    parameters: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          enum: ['ai', 'files', 'browser', 'settings', 'app-store', 'task-manager']
        }
      },
      required: ['app']
    }
  },
  {
    name: 'list_directory',
    description: 'List files and folders in a directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path, e.g. /Home/Documents' }
      },
      required: ['path']
    }
  },
  {
    name: 'create_folder',
    description: 'Create a new folder',
    parameters: {
      type: 'object',
      properties: {
        parent: { type: 'string', description: 'Parent path' },
        name: { type: 'string', description: 'Folder name' }
      },
      required: ['parent', 'name']
    }
  },
  {
    name: 'create_file',
    description: 'Create a new text/markdown file with content',
    parameters: {
      type: 'object',
      properties: {
        parent: { type: 'string' },
        name: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['parent', 'name']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Overwrite content of an existing file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'delete_path',
    description: 'Permanently delete a file or folder (and its contents)',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' }
      },
      required: ['path']
    }
  },
  {
    name: 'move_path',
    description: 'Move a file or folder to a new parent directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        newParent: { type: 'string' }
      },
      required: ['path', 'newParent']
    }
  },
  {
    name: 'rename_path',
    description: 'Rename a file or folder',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        newName: { type: 'string' }
      },
      required: ['path', 'newName']
    }
  },
  {
    name: 'search_files',
    description: 'Search files by name or content',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: ['query']
    }
  },
  {
    name: 'change_setting',
    description: 'Change a system setting (accent color or wallpaper)',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: ['accentColor', 'wallpaper'] },
        value: { type: 'string' }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'show_notification',
    description: 'Show a system notification to the user',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        type: { type: 'string', enum: ['info', 'success', 'warning', 'error'] }
      },
      required: ['message']
    }
  }
];

/** Permission levels required per tool */
export const TOOL_PERMISSIONS = {
  open_app: 'EXECUTE',
  close_app: 'EXECUTE',
  list_directory: 'READ',
  create_folder: 'WRITE',
  create_file: 'WRITE',
  read_file: 'READ',
  write_file: 'WRITE',
  delete_path: 'DELETE',
  move_path: 'MOVE',
  rename_path: 'MOVE',
  search_files: 'READ',
  change_setting: 'SYSTEM',
  show_notification: 'EXECUTE'
};

/**
 * Executor receives the live OS context (vfs, windows, settings, notifications, etc.)
 */
export async function executeTool(name, args, ctx) {
  const { vfs, windows, settings, notifications, storage, permissionManager } = ctx;

  // Permission gate
  const level = TOOL_PERMISSIONS[name] || 'EXECUTE';
  const allowed = await permissionManager.request(name, level, args);
  if (!allowed) {
    return { ok: false, error: `Permission denied for ${name}. User declined.` };
  }

  try {
    switch (name) {
      case 'open_app': {
        const map = {
          ai: 'ai-window',
          files: 'file-manager-window',
          browser: 'browser-window',
          settings: 'settings-window',
          'app-store': 'app-store-window',
          'task-manager': 'task-manager-window'
        };
        const wid = map[args.app];
        if (wid) {
          windows.focusOrOpen(wid);
          return { ok: true, result: `Opened ${args.app}` };
        }
        return { ok: false, error: 'Unknown app' };
      }
      case 'close_app': {
        const map = {
          ai: 'ai-window',
          files: 'file-manager-window',
          browser: 'browser-window',
          settings: 'settings-window',
          'app-store': 'app-store-window',
          'task-manager': 'task-manager-window'
        };
        const wid = map[args.app];
        if (wid) {
          windows.close(wid);
          return { ok: true, result: `Closed ${args.app}` };
        }
        return { ok: false, error: 'Unknown app' };
      }
      case 'list_directory': {
        const items = vfs.list(args.path || '/Home');
        return {
          ok: true,
          result: items.map(i => ({ name: i.name, type: i.type, path: i.path, size: i.size }))
        };
      }
      case 'create_folder': {
        const folder = await vfs.createFolder(args.parent, args.name);
        if (!folder) return { ok: false, error: 'Folder already exists or invalid path' };
        notifications?.show(`Folder "${args.name}" created`, 'success');
        return { ok: true, result: folder.path };
      }
      case 'create_file': {
        const file = await vfs.createFile(args.parent, args.name, args.content || '', 'text/markdown');
        notifications?.show(`File "${args.name}" created`, 'success');
        return { ok: true, result: file.path };
      }
      case 'read_file': {
        const content = await vfs.readFile(args.path);
        if (content == null) return { ok: false, error: 'File not found' };
        return { ok: true, result: content };
      }
      case 'write_file': {
        const file = await vfs.writeFile(args.path, args.content);
        if (!file) return { ok: false, error: 'File not found' };
        return { ok: true, result: 'Written' };
      }
      case 'delete_path': {
        const ok = await vfs.delete(args.path);
        if (!ok) return { ok: false, error: 'Path not found' };
        notifications?.show(`Deleted ${args.path}`, 'info');
        return { ok: true, result: 'Deleted' };
      }
      case 'move_path': {
        const item = await vfs.move(args.path, args.newParent);
        if (!item) return { ok: false, error: 'Move failed' };
        return { ok: true, result: item.path };
      }
      case 'rename_path': {
        const item = await vfs.rename(args.path, args.newName);
        if (!item) return { ok: false, error: 'Rename failed' };
        return { ok: true, result: item.path };
      }
      case 'search_files': {
        const results = vfs.search(args.query);
        return {
          ok: true,
          result: results.slice(0, 10).map(r => ({ name: r.name, path: r.path, type: r.type }))
        };
      }
      case 'change_setting': {
        if (args.key === 'accentColor') {
          settings.accentColor = args.value;
          document.documentElement.style.setProperty('--electric', args.value);
          await storage.put('settings', { id: 'prefs', data: { ...settings } });
          notifications?.show('Accent color updated', 'success');
        } else if (args.key === 'wallpaper') {
          settings.wallpaper = args.value;
          await storage.put('settings', { id: 'prefs', data: { ...settings } });
          eventBus.emit('settings:wallpaper', args.value);
          notifications?.show('Wallpaper updated', 'success');
        }
        return { ok: true, result: 'Setting applied' };
      }
      case 'show_notification': {
        notifications?.show(args.message, args.type || 'info');
        return { ok: true, result: 'Shown' };
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`[AI Tool] ${name} failed`, err);
    return { ok: false, error: err.message || 'Tool execution failed' };
  }
}
