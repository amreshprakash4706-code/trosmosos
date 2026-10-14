import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped, type Zippable } from "fflate";
import { isDescendantPath, joinPath, normalizePath, parentPath, safeName } from "./core.ts";

export const MAX_ZIP_ENTRIES = 200;
export const MAX_ZIP_UNCOMPRESSED = 20_000_000;
export const MAX_ZIP_ENTRY = 1_500_000;

export type ZipEntry = {
  path: string;
  content: Uint8Array;
  isDir: boolean;
};

export function encodeZip(entries: Array<{ path: string; data: Uint8Array | string; isDir?: boolean }>): Uint8Array {
  const tree: Zippable = {};
  for (const e of entries) {
    const p = e.path.replace(/^\/+/, "");
    if (!p) continue;
    if (e.isDir) {
      tree[p.endsWith("/") ? p : p + "/"] = new Uint8Array(0);
      continue;
    }
    const data = typeof e.data === "string" ? strToU8(e.data) : e.data;
    tree[p] = data;
  }
  return zipSync(tree, { level: 6 });
}

export type UnzipIssue = { path: string; reason: string };

export function decodeZip(bytes: Uint8Array, destRoot = "/Home/Downloads"): {
  entries: ZipEntry[];
  skipped: UnzipIssue[];
  uncompressed: number;
} {
  let unzipped: Unzipped;
  try {
    unzipped = unzipSync(bytes);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Invalid ZIP archive");
  }
  const entries: ZipEntry[] = [];
  const skipped: UnzipIssue[] = [];
  let uncompressed = 0;
  const names = Object.keys(unzipped);
  if (names.length > MAX_ZIP_ENTRIES) {
    throw new Error(`Archive has too many entries (${names.length}; max ${MAX_ZIP_ENTRIES})`);
  }
  const dest = normalizePath(destRoot);
  for (const name of names) {
    const data = unzipped[name];
    const isDir = name.endsWith("/") || data.length === 0 && name.endsWith("/");
    const cleaned = name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!cleaned || cleaned.includes("\0")) {
      skipped.push({ path: name, reason: "invalid name" });
      continue;
    }
    const parts = cleaned.split("/").filter((p) => p && p !== "." && p !== "..");
    if (parts.length !== cleaned.split("/").filter(Boolean).length) {
      skipped.push({ path: name, reason: "path traversal" });
      continue;
    }
    const safe = parts.map(safeName).join("/");
    const full = joinPath(dest, safe);
    if (!isDescendantPath(dest, full) && full !== dest) {
      skipped.push({ path: name, reason: "path traversal" });
      continue;
    }
    if (!isDir && data.length > MAX_ZIP_ENTRY) {
      skipped.push({ path: name, reason: "entry too large" });
      continue;
    }
    uncompressed += data.length;
    if (uncompressed > MAX_ZIP_UNCOMPRESSED) {
      throw new Error("Archive uncompressed size exceeds safety limit");
    }
    entries.push({ path: full, content: data, isDir: Boolean(isDir || name.endsWith("/")) });
  }
  return { entries, skipped, uncompressed };
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(clean, "base64"));
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8FromBytes(bytes: Uint8Array): string {
  return strFromU8(bytes);
}

export function parentOf(path: string): string {
  return parentPath(path) || "/";
}
