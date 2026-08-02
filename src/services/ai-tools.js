/**
 * Trosmos OS — AI Tool definitions & executor
 * Controlled interface: AI never gets raw DOM or unrestricted access.
 * Frontend and Netlify function schemas must stay in sync.
 */

import { eventBus } from '../core/event-bus.js';
import { normalizePath } from '../filesystem/virtual-filesystem.js';

export const AI_TOOLS = [
  { name: 'open_app', description: 'Open or focus an application window', parameters: { type: 'object', properties: { app: { type: 'string', enum: ['ai', 'files', 'browser', 'settings', 'app-store', 'task-manager'], description: 'Application to open' } }, required: ['app'] } },
  { name: 'close_app', description: 'Close an application window', parameters: { type: 'object', properties: { app: { type: 'string', enum: ['ai', 'files', 'browser', 'settings', 'app-store', 'task-manager'] } }, required: ['app'] } },
  { name: 'list_directory', description: 'List files and folders in a directory', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Directory path, e.g. /Home/Documents' } }, required: ['path'] } },
  { name: 'create_folder', description: 'Create a new folder', parameters: { type: 'object', properties: { parent: { type: 'string', description: 'Parent path' }, name: { type: 'string', description: 'Folder name' } }, required: ['parent', 'name'] } },
  { name: 'create_file', description: 'Create a new text/markdown file with content', parameters: { type: 'object', properties: { parent: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' } }, required: ['parent', 'name'] } },
  { name: 'read_file', description: 'Read the contents of a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_file', description: 'Overwrite content of an existing file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'delete_path', description: 'Permanently delete a file or folder (and its contents)', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'move_path', description: 'Move a file or folder to a new parent directory', parameters: { type: 'object', properties: { path: { type: 'string' }, newParent: { type: 'string' } }, required: ['path', 'newParent'] } },
  { name: 'rename_path', description: 'Rename a file or folder', parameters: { type: 'object', properties: { path: { type: 'string' }, newName: { type: 'string' } }, required: ['path', 'newName'] } },
  { name: 'search_files', description: 'Search files by name or content', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'change_setting', description: 'Change a system setting (accent color or wallpaper)', parameters: { type: 'object', properties: { key: { type: 'string', enum: ['accentColor', 'wallpaper'] }, value: { type: 'string' } }, required: ['key', 'value'] } },
  { name: 'show_notification', description: 'Show a system notification to the user', parameters: { type: 'object', properties: { message: { type: 'string' }, type: { type: 'string', enum: ['info', 'success', 'warning', 'error'] } }, required: ['message'] } }
];

export const TOOL_PERMISSIONS = {
  open_app: 'EXECUTE', close_app: 'EXECUTE', list_directory: 'READ', create_folder: 'WRITE',
  create_file: 'WRITE', read_file: 'READ', write_file: 'WRITE', delete_path: 'DELETE',
  move_path: 'MOVE', rename_path: 'MOVE', search_files: 'READ', change_setting: 'SYSTEM',
  show_notification: 'EXECUTE'
};

const APP_WINDOW_MAP = {
  ai: 'ai-window', files: 'file-manager-window', browser: 'browser-window',
  settings: 'settings-window', 'app-store': 'app-store-window', 'task-manager': 'task-manager-window'
};

function safeStr(v, max = 500) {
  if (v == null) return '';
  return String(v).slice(0, max);
}

export async function executeTool(name, args, ctx) {
  const { vfs, windows, settings, notifications, storage, permissionManager } = ctx || {};
  if (!name || typeof name !== 'string') return { ok: false, error: 'Invalid tool name' };

  const level = TOOL_PERMISSIONS[name] || 'EXECUTE';
  if (permissionManager) {
    const allowed = await permissionManager.request(name, level, args || {});
    if (!allowed) return { ok: false, error: `Permission denied for ${name}. User declined.` };
  }

  try {
    switch (name) {
      case 'open_app': {
        const wid = APP_WINDOW_MAP[args?.app];
        if (wid && windows?.focusOrOpen) { windows.focusOrOpen(wid); return { ok: true, result: `Opened ${args.app}` }; }
        return { ok: false, error: 'Unknown app' };
      }
      case 'close_app': {
        const wid = APP_WINDOW_MAP[args?.app];
        if (wid && windows?.close) { windows.close(wid); return { ok: true, result: `Closed ${args.app}` }; }
        return { ok: false, error: 'Unknown app' };
      }
      case 'list_directory': {
        if (!vfs) return { ok: false, error: 'Filesystem unavailable' };
        const items = vfs.list(normalizePath(args?.path || '/Home'));
        return { ok: true, result: items.map((i) => ({ name: i.name, type: i.type, path: i.path, size: i.size })) };
      }
      case 'create_folder': {
        if (!vfs) return { ok: false, error: 'Filesystem unavailable' };
        const folder = await vfs.createFolder(normalizePath(args?.parent || '/Home'), safeStr(args?.name, 180));
        if (!folder) return { ok: false, error: 'Folder already exists or invalid path/name' };
        notifications?.show?.(`Folder "${folder.name}" created`, 'success');
        return { ok: true, result: folder.path };
      }
      case 'create_file': {
        if (!vfs) return { ok: false, error: 'Filesystem unavailable' };
        const file = await vfs.createFile(normalizePath(args?.parent || '/Home'), safeStr(args?.name, 180), safeStr(args?.content, 100000), 'text/markdown');
        if (!file) return { ok: false, error: 'Could not create file' };
        notifications?.show?.(`File "${file.name}" created`, 'success');
        return { ok: true, result: file.path };
      }
      case 'read_file': {
        if (!vfs) return { ok: false, error: 'Filesystem unavailable' };
        const content = await vfs.readFile(normalizePath(args?.path));
        if (content == null) return { ok: false, error: 'File not found' };
        return { ok: true, result: String(content).slice(0, 12000) };
      }
      case 'write_file': {
        if (!vfs) return { ok: false, error: 'Filesystem unavailable' };
        const file = await vfs.writeFile(normalizePath(args?.path), safeStr(args?.content, 100000));
        if (!file) return { ok: false, error: 'File not found' };
        return { ok: true, result: 'Written' };
      }
      case 'delete_path': {
        if (!vfs) return { ok: false, error: 'Filesystem unavailable' };
        const path = normalizePath(args?.path);
        if (path === '/Home' || path === '/') return { ok: false, error: 'Cannot delete the Home directory' };
        const ok = await vfs.delete(path);
        if (!ok) return { ok: false, error: 'Path not found' };
        notifications?.show?.(`Deleted ${path}`, 'info');
        return { ok: true, result: 'Deleted' };
      }
      case 'move_path': {
        if (!vfs) return { ok: false, error: 'Filesystem unavailable' };
        const item = await vfs.move(normalizePath(args?.path), normalizePath(args?.newParent));
        if (!item) return { ok: false, error: 'Move failed (invalid path or destination)' };
        return { ok: true, result: item.path };
      }
      case 'rename_path': {
        if (!vfs) return { ok: false, error: 'Filesystem unavailable' };
        const item = await vfs.rename(normalizePath(args?.path), safeStr(args?.newName, 180));
        if (!item) return { ok: false, error: 'Rename failed' };
        return { ok: true, result: item.path };
      }
      case 'search_files': {
        if (!vfs) return { ok: false, error: 'Filesystem unavailable' };
        const results = vfs.search(safeStr(args?.query, 200));
        return { ok: true, result: results.slice(0, 12).map((r) => ({ name: r.name, path: r.path, type: r.type })) };
      }
      case 'change_setting': {
        if (!settings) return { ok: false, error: 'Settings unavailable' };
        if (args?.key === 'accentColor' && typeof args.value === 'string') {
          const color = safeStr(args.value, 32);
          if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) return { ok: false, error: 'Invalid color' };
          settings.accentColor = color;
          document.documentElement.style.setProperty('--electric', color);
          await storage?.put?.('settings', { id: 'prefs', data: { ...settings } });
          notifications?.show?.('Accent color updated', 'success');
        } else if (args?.key === 'wallpaper') {
          settings.wallpaper = safeStr(args.value, 40);
          await storage?.put?.('settings', { id: 'prefs', data: { ...settings } });
          eventBus.emit('settings:wallpaper', settings.wallpaper);
          notifications?.show?.('Wallpaper updated', 'success');
        } else return { ok: false, error: 'Unknown setting' };
        return { ok: true, result: 'Setting applied' };
      }
      case 'show_notification': {
        notifications?.show?.(safeStr(args?.message, 240), args?.type || 'info');
        return { ok: true, result: 'Shown' };
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`[AI Tool] ${name} failed`, err);
    return { ok: false, error: err?.message || 'Tool execution failed' };
  }
}

export default { AI_TOOLS, TOOL_PERMISSIONS, executeTool };
