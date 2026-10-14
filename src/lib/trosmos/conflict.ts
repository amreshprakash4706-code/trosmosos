import { uniqueCandidate } from "./core.ts";

export type ConflictAction = "overwrite" | "rename" | "skip";

export type ConflictChoice = {
  action: ConflictAction;
  applyAll?: boolean;
};

export type ConflictInfo = {
  source: string;
  destination: string;
  sourceName: string;
  destName: string;
};

export function pickConflictName(name: string, taken: Set<string>, action: ConflictAction): string | null {
  if (!taken.has(name)) return name;
  if (action === "skip") return null;
  if (action === "overwrite") return name;
  return uniqueCandidate(name, taken);
}

export function preserveExtension(original: string, next: string): string {
  const i = original.lastIndexOf(".");
  if (i <= 0) return next;
  const ext = original.slice(i);
  if (next.toLowerCase().endsWith(ext.toLowerCase())) return next;
  const stem = next.includes(".") ? next.slice(0, next.lastIndexOf(".")) : next;
  return stem + ext;
}

export type BulkResult<T = unknown> = {
  ok: boolean;
  succeeded: T[];
  failed: Array<{ path: string; error: string }>;
  skipped: string[];
};

export function emptyBulk<T = unknown>(): BulkResult<T> {
  return { ok: true, succeeded: [], failed: [], skipped: [] };
}

export function finishBulk<T>(r: BulkResult<T>): BulkResult<T> {
  r.ok = r.failed.length === 0;
  return r;
}
