/**
 * Trosmos OS 4.0 — Universal Command Registry
 * OS and applications register commands for the command palette / launcher.
 */

import { eventBus } from './event-bus.js';

export class CommandRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this._commands = new Map();
  }

  /**
   * @param {object} cmd
   * @param {string} cmd.id
   * @param {string} cmd.label
   * @param {string} [cmd.keywords]
   * @param {string} [cmd.category]
   * @param {string} [cmd.icon]
   * @param {string} [cmd.appId]
   * @param {Function} cmd.action
   * @param {string} [cmd.shortcut]
   */
  register(cmd) {
    if (!cmd?.id || typeof cmd.action !== 'function') {
      console.warn('[CommandRegistry] Invalid command', cmd);
      return false;
    }
    this._commands.set(cmd.id, {
      category: 'general',
      keywords: '',
      icon: 'fa-terminal',
      ...cmd
    });
    return true;
  }

  unregister(id) {
    this._commands.delete(id);
  }

  get(id) {
    return this._commands.get(id) || null;
  }

  list(filter = {}) {
    let cmds = [...this._commands.values()];
    if (filter.category) cmds = cmds.filter(c => c.category === filter.category);
    if (filter.appId) cmds = cmds.filter(c => c.appId === filter.appId);
    return cmds;
  }

  /**
   * Fuzzy-ish search for command palette / launcher
   */
  search(query) {
    if (!query || !query.trim()) return this.list().slice(0, 30);
    const tokens = query.toLowerCase().trim().split(/\s+/);
    const scored = [];

    for (const cmd of this._commands.values()) {
      const hay = `${cmd.label} ${cmd.keywords || ''} ${cmd.id} ${cmd.category || ''}`.toLowerCase();
      let score = 0;
      let allMatch = true;
      for (const t of tokens) {
        if (hay.includes(t)) {
          score += t.length * 2;
          if (cmd.label.toLowerCase().startsWith(t)) score += 10;
          if (cmd.label.toLowerCase() === t) score += 20;
        } else {
          allMatch = false;
          break;
        }
      }
      if (allMatch && score > 0) scored.push({ cmd, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.cmd);
  }

  async execute(id, args) {
    const cmd = this._commands.get(id);
    if (!cmd) return false;
    try {
      await cmd.action(args);
      eventBus.emit('command:executed', { id, label: cmd.label });
      return true;
    } catch (err) {
      console.error(`[CommandRegistry] execute ${id}:`, err);
      eventBus.emit('system:error', { source: 'command', id, error: String(err) });
      return false;
    }
  }
}

export const commandRegistry = new CommandRegistry();
export default commandRegistry;

if (typeof window !== 'undefined') {
  window.__TrosmosCommands = commandRegistry;
}
