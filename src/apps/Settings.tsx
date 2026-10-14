import { useEffect, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { authClient } from "@/lib/auth/client";
import {
  addMemoryFn,
  clearSearchHistoryFn,
  deleteAccountFn,
  deleteMemoryFn,
  exportBackupFn,
  getSettingsFn,
  importBackupFn,
  memoriesFn,
  pendingMutationsFn,
  revokeSessionFn,
  sessionsFn,
  setSettingsFn,
  statsFn,
  updateMemoryFn,
  updateProfileFn,
  decode,
} from "@/lib/trosmos/api";
import { DEFAULT_SETTINGS, OS_VERSION, formatBytes, type OsSettings } from "@/lib/trosmos/core";
import { formatShortcut, groupedShortcuts } from "@/lib/trosmos/shortcuts";
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
  const [memDraft, setMemDraft] = useState("");
  const [editMem, setEditMem] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<
    Array<{ id: string; createdAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null; current: boolean }>
  >([]);
  const [quota, setQuota] = useState<{ used: number; limit: number; files: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [pending, setPending] = useState<Array<{ op: string; status: string; error?: string | null }>>([]);

  useEffect(() => {
    void getSettingsFn().then((s) => {
      const prefsNext = decode<OsSettings>(s);
      setPrefs(prefsNext);
      useOs.getState().setSettings(prefsNext);
    });
    void memoriesFn().then((m) => setMems(decode(m, [] as typeof mems)));
    void sessionsFn().then((s) => setSessions(decode(s, [] as typeof sessions)));
    void statsFn().then((s) => {
      const q = decode<{ used: number; limit: number; files: number }>(s);
      setQuota({ used: q.used, limit: q.limit, files: q.files });
    });
    void pendingMutationsFn()
      .then((rows) => setPending(decode(rows, [] as typeof pending)))
      .catch(() => setPending([]));
  }, []);

  async function save(patch: Partial<OsSettings>) {
    const next = decode<OsSettings>(await setSettingsFn({ data: patch }));
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
    "Sessions",
    "Storage",
    "AI",
    "Accessibility",
    "About",
  ];
  const grouped = groupedShortcuts();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

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
              <input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => void save({ reduceMotion: e.target.checked })} />
              Reduce motion
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs.highContrast} onChange={(e) => void save({ highContrast: e.target.checked })} />
              High contrast
            </label>
          </>
        ) : null}
        {tab === "Desktop" ? (
          <>
            <h2 className="font-display text-xl">Desktop</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs.snapWindows} onChange={(e) => void save({ snapWindows: e.target.checked })} />
              Snap windows to edges and corners
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs.dockMagnify} onChange={(e) => void save({ dockMagnify: e.target.checked })} />
              Dock magnification
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs.showDesktopIcons} onChange={(e) => void save({ showDesktopIcons: e.target.checked })} />
              Show desktop icons
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs.compactDock} onChange={(e) => void save({ compactDock: e.target.checked })} />
              Compact dock
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs.mobileSingleWindow} onChange={(e) => void save({ mobileSingleWindow: e.target.checked })} />
              One window at a time on small screens
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
              Files, notes, tasks, and AI conversations are scoped to your signed-in account. Other accounts cannot read them
              unless you create a read-only share token.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.privacyStoreSearch}
                onChange={(e) => void save({ privacyStoreSearch: e.target.checked })}
              />
              Store search history on this account
            </label>
            <GhostBtn
              onClick={async () => {
                await clearSearchHistoryFn();
                setStatus("Search history cleared");
              }}
            >
              Clear search history
            </GhostBtn>
            <h3 className="pt-2 font-medium">AI memories</h3>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!memDraft.trim()) return;
                await addMemoryFn({ data: { content: memDraft } });
                setMemDraft("");
                setMems((await memoriesFn()) as typeof mems);
              }}
            >
              <input
                value={memDraft}
                onChange={(e) => setMemDraft(e.target.value)}
                placeholder="Remember this…"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
              />
              <GhostBtn type="submit">Add</GhostBtn>
            </form>
            {!mems.length ? <p className="text-sm text-muted">No stored memories.</p> : null}
            {mems.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-2 rounded-xl bg-white/5 p-2 text-sm">
                <textarea
                  value={editMem[m.id] ?? m.content}
                  onChange={(e) => setEditMem((s) => ({ ...s, [m.id]: e.target.value }))}
                  className="min-h-16 min-w-0 flex-1 bg-transparent outline-none"
                />
                <GhostBtn
                  onClick={async () => {
                    const content = editMem[m.id] ?? m.content;
                    await updateMemoryFn({ data: { id: m.id, content } });
                    setMems((await memoriesFn()) as typeof mems);
                  }}
                >
                  Save
                </GhostBtn>
                <GhostBtn
                  danger
                  onClick={async () => {
                    await deleteMemoryFn({ data: { id: m.id } });
                    setMems((await memoriesFn()) as typeof mems);
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
            <div className="mt-8 rounded-2xl border border-rose-500/30 p-4">
              <h3 className="font-medium text-rose-200">Delete account</h3>
              <p className="mt-1 text-sm text-muted">
                Permanently deletes this Trosmos account and all private data. Type DELETE to confirm.
              </p>
              <input
                value={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
              />
              <GhostBtn
                danger
                onClick={async () => {
                  await deleteAccountFn({ data: { confirm: confirmDelete } });
                  await authClient.signOut();
                  window.location.assign("/");
                }}
              >
                Delete account
              </GhostBtn>
            </div>
          </>
        ) : null}
        {tab === "Sessions" ? (
          <>
            <h2 className="font-display text-xl">Sessions</h2>
            <p className="text-sm text-muted">Signed-in sessions for this account. Revoking signs that device out.</p>
            {!sessions.length ? <p className="text-sm text-muted">No session rows available in this environment.</p> : null}
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl bg-white/5 p-3 text-sm">
                <div>
                  <div className="truncate">{s.userAgent || s.id}</div>
                  <div className="text-[11px] text-faint">
                    {new Date(s.createdAt).toLocaleString()} · expires {new Date(s.expiresAt).toLocaleString()}
                    {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                  </div>
                </div>
                <GhostBtn
                  danger
                  onClick={async () => {
                    await revokeSessionFn({ data: { id: s.id } });
                    setSessions((await sessionsFn()) as typeof sessions);
                  }}
                >
                  Revoke
                </GhostBtn>
              </div>
            ))}
          </>
        ) : null}
        {tab === "Storage" ? (
          <>
            <h2 className="font-display text-xl">Storage</h2>
            {quota ? (
              <div>
                <div className="mb-1 text-sm text-muted">
                  {formatBytes(quota.used)} of {formatBytes(quota.limit)} · {quota.files} files
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{ width: `${Math.min(100, Math.round((quota.used / Math.max(1, quota.limit)) * 100))}%` }}
                  />
                </div>
              </div>
            ) : null}
            {pending.length ? (
              <div>
                <h3 className="font-medium">Queued mutations</h3>
                <p className="text-xs text-muted">Server-side pending mutations for this account (offline replay leftovers).</p>
                {pending.map((p, i) => (
                  <div key={i} className="text-xs text-faint">
                    {p.op} · {p.status}
                    {p.error ? ` · ${p.error}` : ""}
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-sm text-muted">
              Export a JSON archive of your files, notes, tasks, events, and settings. Import restores into this account only.
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
              Trosmos AI uses Grok on the server. Mutating tools wait for your confirmation. Chat is request/response (not
              token streaming) so tool confirmation can run on a complete reply.
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
              Window controls are buttons. Reduce motion is honored system-wide. Focus rings follow the accent color.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs.largePointer} onChange={(e) => void save({ largePointer: e.target.checked })} />
              Larger click targets
            </label>
            <h3 className="pt-2 font-medium">Shortcut map</h3>
            {Object.entries(grouped).map(([group, list]) => (
              <div key={group}>
                <div className="mt-3 text-xs uppercase text-faint">{group}</div>
                {list.map((s) => (
                  <div key={s.id} className="flex justify-between py-1 text-sm">
                    <span>{s.label}</span>
                    <kbd className="text-muted">{formatShortcut(s.keys, isMac)}</kbd>
                  </div>
                ))}
              </div>
            ))}
          </>
        ) : null}
        {tab === "About" ? (
          <>
            <h2 className="font-display text-xl">Trosmos OS {OS_VERSION}</h2>
            <p className="max-w-lg text-sm leading-relaxed text-muted">
              An AI-native web operating environment. The Terminal is a Trosmos shell, not a host shell. Atlas can only embed
              sites that allow it. Binary files are capped at 1.5 MB on this hosted stack. Background jobs run while you are
              using Trosmos.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
