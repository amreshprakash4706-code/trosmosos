/**
 * Trosmos OS 4.0 — Undo / Redo Infrastructure
 * Command pattern for reversible operations across apps.
 */

import { eventBus } from './event-bus.js';

export class UndoManager {
  constructor(maxDepth = 50) {
    this._undoStack = [];
    this._redoStack = [];
    this._maxDepth = maxDepth;
    this._enabled = true;
  }

  /**
   * @param {object} command
   * @param {string} command.label
   * @param {Function} command.do - execute
   * @param {Function} command.undo - reverse
   * @param {string} [command.scope] - app or subsystem id
   */
  async execute(command) {
    if (!command || typeof command.do !== 'function' || typeof command.undo !== 'function') {
      throw new Error('Invalid undo command');
    }
    const result = await command.do();
    if (this._enabled) {
      this._undoStack.push(command);
      if (this._undoStack.length > this._maxDepth) this._undoStack.shift();
      this._redoStack = [];
      eventBus.emit('undo:pushed', { label: command.label });
    }
    return result;
  }

  canUndo() { return this._undoStack.length > 0; }
  canRedo() { return this._redoStack.length > 0; }

  peekUndo() {
    return this._undoStack[this._undoStack.length - 1] || null;
  }

  async undo() {
    const cmd = this._undoStack.pop();
    if (!cmd) return false;
    try {
      await cmd.undo();
      this._redoStack.push(cmd);
      eventBus.emit('undo:performed', { label: cmd.label });
      return true;
    } catch (err) {
      console.error('[UndoManager] undo failed', err);
      this._undoStack.push(cmd); // restore
      return false;
    }
  }

  async redo() {
    const cmd = this._redoStack.pop();
    if (!cmd) return false;
    try {
      await cmd.do();
      this._undoStack.push(cmd);
      eventBus.emit('redo:performed', { label: cmd.label });
      return true;
    } catch (err) {
      console.error('[UndoManager] redo failed', err);
      this._redoStack.push(cmd);
      return false;
    }
  }

  clear(scope) {
    if (!scope) {
      this._undoStack = [];
      this._redoStack = [];
      return;
    }
    this._undoStack = this._undoStack.filter(c => c.scope !== scope);
    this._redoStack = this._redoStack.filter(c => c.scope !== scope);
  }
}

export const undoManager = new UndoManager();
export default undoManager;

if (typeof window !== 'undefined') {
  window.__TrosmosUndo = undoManager;
}
