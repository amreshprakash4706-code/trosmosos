/**
 * Trosmos OS 4.0 — Multi-Workspace Desktop Manager
 * Virtual desktops with persistence and keyboard switching.
 */

import { eventBus } from './event-bus.js';

const DEFAULT_WORKSPACES = [
  { id: 'ws-main', name: 'Main', index: 0 },
  { id: 'ws-work', name: 'Work', index: 1 },
  { id: 'ws-dev', name: 'Development', index: 2 },
  { id: 'ws-personal', name: 'Personal', index: 3 }
];

export class WorkspaceManager {
  constructor(storage) {
    this.storage = storage;
    this.workspaces = DEFAULT_WORKSPACES.map(w => ({ ...w }));
    this.activeIndex = 0;
    /** windowId -> workspaceIndex */
    this._windowMap = new Map();
  }

  async init() {
    try {
      const rec = await this.storage?.get?.('workspaces', 'state');
      if (rec?.data) {
        if (Array.isArray(rec.data.workspaces) && rec.data.workspaces.length) {
          this.workspaces = rec.data.workspaces;
        }
        if (typeof rec.data.activeIndex === 'number') {
          this.activeIndex = Math.max(0, Math.min(rec.data.activeIndex, this.workspaces.length - 1));
        }
        if (rec.data.windowMap) {
          this._windowMap = new Map(Object.entries(rec.data.windowMap).map(([k, v]) => [k, v]));
        }
      }
    } catch (_) {}
  }

  get active() {
    return this.workspaces[this.activeIndex];
  }

  list() {
    return this.workspaces.map((w, i) => ({
      ...w,
      active: i === this.activeIndex,
      windowCount: [...this._windowMap.values()].filter(v => v === i).length
    }));
  }

  async switchTo(index) {
    if (index < 0 || index >= this.workspaces.length || index === this.activeIndex) return false;
    const prev = this.activeIndex;
    this.activeIndex = index;
    this._applyVisibility();
    eventBus.emit('workspace:changed', { from: prev, to: index, workspace: this.active });
    await this._persist();
    return true;
  }

  async next() {
    return this.switchTo((this.activeIndex + 1) % this.workspaces.length);
  }

  async prev() {
    return this.switchTo((this.activeIndex - 1 + this.workspaces.length) % this.workspaces.length);
  }

  assignWindow(windowId, workspaceIndex = this.activeIndex) {
    this._windowMap.set(windowId, workspaceIndex);
    this._applyVisibility();
    this._persist();
  }

  moveWindow(windowId, toIndex) {
    if (toIndex < 0 || toIndex >= this.workspaces.length) return;
    this._windowMap.set(windowId, toIndex);
    this._applyVisibility();
    this._persist();
  }

  removeWindow(windowId) {
    this._windowMap.delete(windowId);
    this._persist();
  }

  workspaceOf(windowId) {
    return this._windowMap.has(windowId) ? this._windowMap.get(windowId) : this.activeIndex;
  }

  _applyVisibility() {
    // Hide/show windows based on workspace assignment
    for (const [windowId, wsIndex] of this._windowMap) {
      const el = document.getElementById(windowId);
      if (!el) continue;
      if (wsIndex === this.activeIndex) {
        el.classList.remove('workspace-hidden');
        el.style.visibility = '';
      } else {
        el.classList.add('workspace-hidden');
        // Keep in DOM but hide; minimized windows stay minimized
        if (!el.classList.contains('minimized')) {
          el.style.visibility = 'hidden';
        }
      }
    }
  }

  async _persist() {
    try {
      const windowMap = Object.fromEntries(this._windowMap);
      await this.storage?.put?.('workspaces', {
        id: 'state',
        data: { workspaces: this.workspaces, activeIndex: this.activeIndex, windowMap }
      });
    } catch (_) {}
  }
}

export default WorkspaceManager;
