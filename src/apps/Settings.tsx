import { useEffect, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
  exportBackupFn,
  getSettingsFn,
  importBackupFn,
  setSettingsFn,
  updateProfileFn,
  memoriesFn,
  deleteMemoryFn,
} from "@/lib/trosmos/api";
import { DEFAULT_SETTINGS, type OsSettings } from "@/lib/trosmos/core";
import type { Json } from "@/lib/trosmos/types";
import { useOs } from "@/os/store";
import { GhostBtn, errMsg } from "./ui";

const ACCENTS = ["#3B82F6", "#06B6D4", "#7C3AED", "#10B981", "#f59e0b"];

export function SettingsApp() {
  const user = useCurrentUser();
  const [tab, setTab] = useState("Appearance");
  const [prefs, setPrefs] = useState<OsSettings>(DEFAULT_SETTINGS);
  const [display, setDisplay] = useState(user?.displayName || "");
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [status, setStatus] = useState<string | null>(null);
  const [mems, setMems] = useState<Array<{ id: string; content: string; created_at: string }>>([]);

  useEffect(() => {
    void getSettingsFn().then((s) => {
      setPrefs(s);
      useOs.getState().setSettings(s);
    });
    void memoriesFn().then((m) => setMems(m as Array<{ id: string; content: string; created_at: string }>));
  }, []);

  async function save(patch: Partial<OsSettings>) {
    const next = await setSettingsFn({ data: patch });
    setPrefs(next);
    useOs.getState().setSettings(next);
    document.documentElement.style.setProperty("--accent", next.accentColor);
    document.documentElement.classList.toggle("reduce-motion", next.reduceMotion);
    document.documentElement.classList.toggle("high-contrast", next.highContrast);
  }

  const nav = [
    "Appearance",
    "Desktop",
    "Notifications",
    "Privacy",
    "Account",
    "Storage",
    "AI",
    "Accessibility",
    "About",
  ];

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-40 shrink-0 overflow-auto border-r border-white/10 p-2 text-sm">
        {nav.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setTab(n)}
            className={`block w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10 ${tab === n ? "bg-white/10" : "text-muted"}`}
          >
            {n}
          </button>
        ))}
      </aside>
      <div className="min-w-0 flex-1 overflow-auto p-5 space-y-4">
        {status ? <p className="text-sm text-emerald-300">{status}</p> : null}
        {tab === "Appearance" ? (
          <>
            <h2 className="font-display text-xl">Appearance</h2>
            <p className="text-sm text-muted">Accent color is used on the dock, snaps, and focus rings.</p>
            <div className="flex gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Accent ${c}`}
                  onClick={() => void save({ accentColor: c })}
                  className="size-8 rounded-full ring-2 ring-white/20"
                  style={{ background: c }}
                />
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.reduceMotion}
                onChange={(e) => void save({ reduceMotion: e.target.checked })}
              />
              Reduce motion
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.highContrast}
                onChange={(e) => void save({ highContrast: e.target.checked })}
              />
              High contrast
            </label>
          </>
        ) : null}
        {tab === "Desktop" ? (
          <>
            <h2 className="font-display text-xl">Desktop</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.snapWindows}
                onChange={(e) => void save({ snapWindows: e.target.checked })}
              />
              Snap windows to edges
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.dockMagnify}
                onChange={(e) => void save({ dockMagnify: e.target.checked })}
              />
              Dock magnification
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.showDesktopIcons}
                onChange={(e) => void save({ showDesktopIcons: e.target.checked })}
              />
              Show desktop icons
            </label>
            <label className="flex items-center gap-2 text-sm">
              Clock
              <select
                value={prefs.clockFormat}
                onChange={(e) => void save({ clockFormat: e.target.value as "12h" | "24h" })}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1"
              >
                <option value="24h">24-hour</option>
                <option value="12h">12-hour</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              Wallpaper
              <select
                value={prefs.wallpaper}
                onChange={(e) => void save({ wallpaper: e.target.value as OsSettings["wallpaper"] })}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1"
              >
                <option value="aurora">Aurora</option>
                <option value="nebula">Nebula</option>
                <option value="dusk">Dusk</option>
                <option value="void">Void</option>
              </select>
            </label>
          </>
        ) : null}
        {tab === "Notifications" ? (
          <>
            <h2 className="font-display text-xl">Notifications</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.notificationsEnabled}
                onChange={(e) => void save({ notificationsEnabled: e.target.checked })}
              />
              In-OS notifications
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.browserNotifications}
                onChange={async (e) => {
                  if (e.target.checked && "Notification" in window) {
                    const perm = await Notification.requestPermission();
                    await save({ browserNotifications: perm === "granted" });
                  } else await save({ browserNotifications: false });
                }}
              />
              Browser notifications (asks permission)
            </label>
          </>
        ) : null}
        {tab === "Privacy" ? (
          <>
            <h2 className="font-display text-xl">Privacy</h2>
            <p className="text-sm text-muted">
              Files, notes, tasks, and AI conversations are scoped to your signed-in account. Other
              accounts cannot read them. AI tools cannot run mutating actions without confirmation when
              that setting is on.
            </p>
            <h3 className="pt-2 font-medium">AI memories</h3>
            {!mems.length ? <p className="text-sm text-muted">No stored memories.</p> : null}
            {mems.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-2 rounded-xl bg-white/5 p-2 text-sm">
                <span>{m.content}</span>
                <GhostBtn
                  danger
                  onClick={async () => {
                    await deleteMemoryFn({ data: { id: m.id } });
                    setMems(await memoriesFn() as typeof mems);
                  }}
                >
                  Delete
                </GhostBtn>
              </div>
            ))}
          </>
        ) : null}
        {tab === "Account" ? (
          <>
            <h2 className="font-display text-xl">Account</h2>
            <p className="text-sm text-muted">{user?.primaryEmail}</p>
            <label className="block text-sm">
              Display name
              <input
                value={display}
                onChange={(e) => setDisplay(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Timezone
              <input
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              />
            </label>
            <GhostBtn
              onClick={async () => {
                await updateProfileFn({ data: { displayName: display, timezone: tz } });
                setStatus("Profile saved");
              }}
            >
              Save profile
            </GhostBtn>
            <div className="pt-4">
              <UserButton />
            </div>
          </>
        ) : null}
        {tab === "Storage" ? (
          <>
            <h2 className="font-display text-xl">Backup</h2>
            <p className="text-sm text-muted">
              Export a JSON archive of your files, notes, tasks, events, and settings. Import restores
              into this account only.
            </p>
            <div className="flex gap-2">
              <GhostBtn
                onClick={async () => {
                  const data = await exportBackupFn();
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `trosmos-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setStatus("Backup downloaded");
                }}
              >
                Export
              </GhostBtn>
              <label className="rounded-lg px-2.5 py-1.5 text-sm hover:bg-white/10">
                Import
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const backup = JSON.parse(await f.text()) as { [key: string]: Json };
                      await importBackupFn({ data: { backup, overwrite: false } });
                      setStatus("Import complete");
                    } catch (err) {
                      setStatus(errMsg(err));
                    }
                  }}
                />
              </label>
            </div>
          </>
        ) : null}
        {tab === "AI" ? (
          <>
            <h2 className="font-display text-xl">AI</h2>
            <p className="text-sm text-muted">
              Trosmos AI uses Grok on the server. Mutating tools wait for your confirmation.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.aiConfirmMutations}
                onChange={(e) => void save({ aiConfirmMutations: e.target.checked })}
              />
              Confirm file and data changes
            </label>
          </>
        ) : null}
        {tab === "Accessibility" ? (
          <>
            <h2 className="font-display text-xl">Accessibility</h2>
            <p className="text-sm text-muted">
              Keyboard: Ctrl/⌘ K command palette, Ctrl/⌘ / AI, Alt Tab switcher, Esc closes overlays.
              All window controls are buttons. Reduce motion is honored system-wide.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.largePointer}
                onChange={(e) => void save({ largePointer: e.target.checked })}
              />
              Larger click targets
            </label>
          </>
        ) : null}
        {tab === "About" ? (
          <>
            <h2 className="font-display text-xl">Trosmos OS 5.0</h2>
            <p className="max-w-lg text-sm leading-relaxed text-muted">
              An AI-native web operating environment. The Terminal is a Trosmos shell, not a host
              shell. Atlas can only embed sites that allow it. Binary files are capped at 1.5 MB on
              this hosted stack. Background jobs run while you are using Trosmos.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
