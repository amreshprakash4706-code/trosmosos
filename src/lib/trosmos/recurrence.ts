/** Recurrence rules for tasks and calendar events. Stored as compact strings. */

export type RecurrenceFreq = "daily" | "weekly" | "monthly";

export type RecurrenceRule = {
  freq: RecurrenceFreq;
  interval: number;
};

export function parseRecurrence(raw: string | null | undefined): RecurrenceRule | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === "daily" || s === "weekly" || s === "monthly") return { freq: s, interval: 1 };
  const m = s.match(/^(daily|weekly|monthly):(\d+)$/);
  if (m) {
    const interval = Math.max(1, Math.min(30, Number(m[2]) || 1));
    return { freq: m[1] as RecurrenceFreq, interval };
  }
  return null;
}

export function serializeRecurrence(rule: RecurrenceRule | null | undefined): string | null {
  if (!rule) return null;
  if (rule.interval <= 1) return rule.freq;
  return `${rule.freq}:${rule.interval}`;
}

export function nextOccurrence(from: Date, rule: RecurrenceRule): Date {
  const d = new Date(from.getTime());
  const n = Math.max(1, rule.interval);
  if (rule.freq === "daily") d.setUTCDate(d.getUTCDate() + n);
  else if (rule.freq === "weekly") d.setUTCDate(d.getUTCDate() + 7 * n);
  else d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

export function expandOccurrences(start: Date, rule: RecurrenceRule, rangeStart: Date, rangeEnd: Date, cap = 64): Date[] {
  const out: Date[] = [];
  let cursor = new Date(start.getTime());
  let guard = 0;
  while (cursor < rangeStart && guard < 400) {
    cursor = nextOccurrence(cursor, rule);
    guard += 1;
  }
  while (cursor <= rangeEnd && out.length < cap && guard < 800) {
    if (cursor >= rangeStart) out.push(new Date(cursor.getTime()));
    cursor = nextOccurrence(cursor, rule);
    guard += 1;
  }
  return out;
}

export function isOverdue(dueAt: string | null | undefined, status: string, now = new Date()): boolean {
  if (!dueAt) return false;
  if (status === "done" || status === "cancelled") return false;
  const t = new Date(dueAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t < now.getTime();
}

export const RECURRENCE_LABELS: Record<string, string> = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};
