import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { fail } from "./errors";
import {
  MAX_FILE_SIZE_BYTES,
  basename,
  isImageMime,
  isSystemPath,
  isTextMime,
  joinPath,
  normalizePath,
  parentPath,
  safeName,
  uid,
} from "./core";
import { emptyBulk, finishBulk, pickConflictName, type BulkResult, type ConflictAction } from "./conflict";
import { base64ToBytes, bytesToBase64, decodeZip, encodeZip, utf8FromBytes } from "./zip";
import * as vfs from "./vfs.server";
import type { FileComment, ShareGrant, VfsNode } from "./types";

export type { ConflictAction };

async function takenNames(userId: string, dest: string): Promise<Set<string>> {
  const items = await vfs.listDirectory(userId, dest);
  return new Set(items.map((n) => n.name));
}

async function applyConflict(
  userId: string,
  dest: string,
  name: string,
  action: ConflictAction,
): Promise<{ name: string | null; overwrite: boolean }> {
  const taken = await takenNames(userId, dest);
  const next = pickConflictName(name, taken, action);
  if (next == null) return { name: null, overwrite: false };
  return { name: next, overwrite: action === "overwrite" && taken.has(name) };
}

export async function bulkTrash(userId: string, paths: string[]): Promise<BulkResult<{ path: string }>> {
  const r = emptyBulk<{ path: string }>();
  for (const path of paths) {
    try {
      await vfs.trashNode(userId, path);
      r.succeeded.push({ path: normalizePath(path) });
    } catch (err) {
      r.failed.push({ path, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  return finishBulk(r);
}

export async function bulkRestore(userId: string, paths: string[]): Promise<BulkResult<VfsNode>> {
  const r = emptyBulk<VfsNode>();
  for (const path of paths) {
    try {
      r.succeeded.push(await vfs.restoreNode(userId, path));
    } catch (err) {
      r.failed.push({ path, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  return finishBulk(r);
}

export async function bulkDelete(userId: string, paths: string[]): Promise<BulkResult<{ path: string }>> {
  const r = emptyBulk<{ path: string }>();
  for (const path of paths) {
    try {
      await vfs.permanentlyDelete(userId, path);
      r.succeeded.push({ path: normalizePath(path) });
    } catch (err) {
      r.failed.push({ path, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  return finishBulk(r);
}

export async function bulkMove(
  userId: string,
  paths: string[],
  destination: string,
  onConflict: ConflictAction = "rename",
): Promise<BulkResult<VfsNode>> {
  const r = emptyBulk<VfsNode>();
  const dest = normalizePath(destination);
  for (const path of paths) {
    const p = normalizePath(path);
    try {
      if (isSystemPath(p)) {
        r.failed.push({ path: p, error: "Cannot move system folders" });
        continue;
      }
      const node = await vfs.getNodeByPath(userId, p);
      if (!node) {
        r.failed.push({ path: p, error: "Not found" });
        continue;
      }
      const { name, overwrite } = await applyConflict(userId, dest, node.name, onConflict);
      if (!name) {
        r.skipped.push(p);
        continue;
      }
      if (overwrite) {
        const existing = joinPath(dest, name);
        if (existing !== p) await vfs.permanentlyDelete(userId, existing);
      }
      let moved = await vfs.moveNode(userId, p, dest);
      if (moved.name !== name) moved = await vfs.renameNode(userId, moved.path, name);
      r.succeeded.push(moved);
    } catch (err) {
      r.failed.push({ path: p, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  return finishBulk(r);
}

export async function bulkCopy(
  userId: string,
  paths: string[],
  destination: string,
  onConflict: ConflictAction = "rename",
): Promise<BulkResult<VfsNode>> {
  const r = emptyBulk<VfsNode>();
  const dest = normalizePath(destination);
  for (const path of paths) {
    const p = normalizePath(path);
    try {
      const node = await vfs.getNodeByPath(userId, p);
      if (!node) {
        r.failed.push({ path: p, error: "Not found" });
        continue;
      }
      const { name, overwrite } = await applyConflict(userId, dest, node.name, onConflict);
      if (!name) {
        r.skipped.push(p);
        continue;
      }
      if (overwrite) {
        const existing = joinPath(dest, name);
        if (existing !== p) await vfs.permanentlyDelete(userId, existing);
      }
      r.succeeded.push(await vfs.copyNode(userId, p, dest, name));
    } catch (err) {
      r.failed.push({ path: p, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  return finishBulk(r);
}

function rowToShare(row: {
  id: string;
  token: string;
  path: string;
  title: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  access_count: number | string;
  created_at: string;
}): ShareGrant {
  return {
    id: row.id,
    token: row.token,
    path: row.path,
    title: row.title,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    accessCount: Number(row.access_count) || 0,
    createdAt: String(row.created_at),
  };
}

export async function createShare(
  userId: string,
  path: string,
  opts: { title?: string; expiresAt?: string | null } = {},
): Promise<ShareGrant> {
  const p = normalizePath(path);
  const node = await vfs.getNodeByPath(userId, p);
  if (!node) fail(404, "Path not found");
  const sql = await getSql();
  const id = uid("shr");
  const token = randomBytes(18).toString("base64url");
  await sql.query(
    `insert into share_grants (id, user_id, token, path, title, expires_at, created_at)
     values ($1,$2,$3,$4,$5,$6,now())`,
    [id, userId, token, p, opts.title || node.name, opts.expiresAt || null],
  );
  const rows = await sql.query(
    `select id, token, path, title, expires_at, revoked_at, access_count, created_at
       from share_grants where id = $1 and user_id = $2`,
    [id, userId],
  );
  return rowToShare(rows[0] as Parameters<typeof rowToShare>[0]);
}

export async function listShares(userId: string): Promise<ShareGrant[]> {
  const sql = await getSql();
  const rows = await sql.query(
    `select id, token, path, title, expires_at, revoked_at, access_count, created_at
       from share_grants where user_id = $1 order by created_at desc`,
    [userId],
  );
  return (rows as Parameters<typeof rowToShare>[0][]).map(rowToShare);
}

export async function revokeShare(userId: string, id: string) {
  const sql = await getSql();
  const rows = await sql.query(`select id from share_grants where id = $1 and user_id = $2`, [id, userId]);
  if (!rows[0]) fail(404, "Share not found");
  await sql.query(`update share_grants set revoked_at = now() where id = $1 and user_id = $2`, [id, userId]);
  return { ok: true as const };
}

export async function resolveShare(userId: string, token: string) {
  const sql = await getSql();
  const rows = await sql.query<{
    id: string;
    user_id: string;
    token: string;
    path: string;
    title: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    access_count: number | string;
    created_at: string;
  }>(`select * from share_grants where token = $1 limit 1`, [token]);
  const row = rows[0];
  if (!row) fail(404, "Share not found");
  if (row.revoked_at) fail(403, "This share has been revoked");
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) fail(403, "This share has expired");
  const ownerId = row.user_id;
  const readOnly = ownerId !== userId;
  await sql.query(
    `update share_grants set access_count = access_count + 1, last_accessed_at = now() where id = $1`,
    [row.id],
  );
  const node = await vfs.getNodeByPath(ownerId, row.path);
  if (!node) fail(404, "Shared path is no longer available");
  if (node.isDir) {
    const items = await vfs.listDirectory(ownerId, row.path);
    return { grant: rowToShare(row), node, items, file: null as null, readOnly };
  }
  const file = await vfs.readFile(ownerId, row.path);
  return { grant: rowToShare(row), node, items: [] as VfsNode[], file, readOnly };
}

export async function listComments(userId: string, path: string): Promise<FileComment[]> {
  const sql = await getSql();
  const p = normalizePath(path);
  const rows = await sql.query<{ id: string; path: string; body: string; created_at: string; updated_at: string }>(
    `select id, path, body, created_at, updated_at from file_comments
      where user_id = $1 and path = $2 order by created_at asc`,
    [userId, p],
  );
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    body: r.body,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

export async function addComment(userId: string, path: string, body: string): Promise<FileComment> {
  const p = normalizePath(path);
  const node = await vfs.getNodeByPath(userId, p);
  if (!node) fail(404, "File not found");
  const text = String(body || "").trim().slice(0, 4000);
  if (!text) fail(400, "Comment required");
  const sql = await getSql();
  const id = uid("cmt");
  await sql.query(
    `insert into file_comments (id, user_id, path, body, created_at, updated_at) values ($1,$2,$3,$4,now(),now())`,
    [id, userId, p, text],
  );
  const rows = await listComments(userId, p);
  return rows.find((c) => c.id === id)!;
}

export async function deleteComment(userId: string, id: string) {
  const sql = await getSql();
  await sql.query(`delete from file_comments where id = $1 and user_id = $2`, [id, userId]);
  return { ok: true as const };
}

export async function setTags(userId: string, path: string, tags: string[]) {
  const p = normalizePath(path);
  const node = await vfs.getNodeByPath(userId, p);
  if (!node) fail(404, "Not found");
  const clean = [...new Set(tags.map((t) => String(t).trim().toLowerCase().slice(0, 32)).filter(Boolean))].slice(0, 16);
  const sql = await getSql();
  await sql.query(`delete from file_tags where user_id = $1 and path = $2`, [userId, p]);
  for (const tag of clean) {
    await sql.query(`insert into file_tags (user_id, path, tag, created_at) values ($1,$2,$3,now())`, [userId, p, tag]);
  }
  return { path: p, tags: clean };
}

export async function listTags(userId: string, path?: string) {
  const sql = await getSql();
  if (path) {
    const rows = await sql.query<{ tag: string }>(
      `select tag from file_tags where user_id = $1 and path = $2 order by tag`,
      [userId, normalizePath(path)],
    );
    return rows.map((r) => r.tag);
  }
  const rows = await sql.query<{ tag: string; c: number | string }>(
    `select tag, count(*) as c from file_tags where user_id = $1 group by tag order by c desc, tag`,
    [userId],
  );
  return rows.map((r) => ({ tag: r.tag, count: Number(r.c) || 0 }));
}

export async function filesByTag(userId: string, tag: string) {
  const sql = await getSql();
  const rows = await sql.query<{ path: string }>(
    `select path from file_tags where user_id = $1 and tag = $2 order by path`,
    [userId, tag.trim().toLowerCase()],
  );
  const out: VfsNode[] = [];
  for (const r of rows) {
    const n = await vfs.getNodeByPath(userId, r.path);
    if (n) out.push(n);
  }
  return out;
}

export async function thumbnailFor(userId: string, path: string) {
  const file = await vfs.readFile(userId, path);
  if (!isImageMime(file.mimeType, file.name)) fail(400, "Not an image");
  const mime = file.mimeType || "image/png";
  if (file.encoding === "base64") {
    return { path: file.path, mimeType: mime, dataUrl: `data:${mime};base64,${file.content}`, size: file.size };
  }
  if (mime === "image/svg+xml" || file.name.endsWith(".svg")) {
    return {
      path: file.path,
      mimeType: mime,
      dataUrl: `data:image/svg+xml,${encodeURIComponent(file.content)}`,
      size: file.size,
    };
  }
  fail(400, "Unsupported image encoding");
}

export async function createZipArchive(
  userId: string,
  paths: string[],
  destParent: string,
  name: string,
  onProgress?: (p: number) => Promise<void>,
) {
  const parent = normalizePath(destParent || "/Home/Documents");
  const zipName = safeName(name.endsWith(".zip") ? name : `${name}.zip`);
  const entries: Array<{ path: string; data: Uint8Array; isDir?: boolean }> = [];
  const files: Array<{ path: string; rel: string }> = [];
  for (const raw of paths) {
    const p = normalizePath(raw);
    const node = await vfs.getNodeByPath(userId, p);
    if (!node) continue;
    if (node.isDir) {
      const tree = await vfs.getTree(userId, p);
      const rootParent = parentPath(p) || "/";
      const prefix = rootParent === "/" ? "" : rootParent;
      for (const n of tree) {
        const rel = prefix ? n.path.slice(prefix.length).replace(/^\//, "") : n.path.replace(/^\//, "");
        if (n.isDir) entries.push({ path: rel || n.name, data: new Uint8Array(0), isDir: true });
        else files.push({ path: n.path, rel: rel || n.name });
      }
    } else files.push({ path: p, rel: node.name });
  }
  let i = 0;
  for (const fp of files) {
    const file = await vfs.readFile(userId, fp.path);
    const data =
      file.encoding === "base64" ? base64ToBytes(file.content) : new TextEncoder().encode(file.content);
    entries.push({ path: fp.rel, data });
    i += 1;
    if (onProgress) await onProgress(i / Math.max(1, files.length));
  }
  const bytes = encodeZip(entries);
  if (bytes.length > MAX_FILE_SIZE_BYTES) fail(413, "Archive exceeds maximum file size");
  const node = await vfs.createFile(userId, parent, zipName, bytesToBase64(bytes), "base64");
  return node;
}

export async function extractZipArchive(
  userId: string,
  zipPath: string,
  destParent: string,
  onProgress?: (p: number) => Promise<void>,
) {
  const dest = normalizePath(destParent || "/Home/Downloads");
  await vfs.mkdirp(userId, dest);
  const file = await vfs.readFile(userId, zipPath);
  if (file.encoding !== "base64" && file.mimeType !== "application/zip") {
    fail(400, "Not a zip archive");
  }
  const bytes = file.encoding === "base64" ? base64ToBytes(file.content) : new TextEncoder().encode(file.content);
  const { entries, skipped } = decodeZip(bytes, dest);
  const created: VfsNode[] = [];
  let i = 0;
  for (const e of entries) {
    const parent = parentPath(e.path) || dest;
    await vfs.mkdirp(userId, parent);
    if (e.isDir) {
      try {
        await vfs.mkdirp(userId, e.path);
      } catch {
        /* exists */
      }
    } else {
      const name = basename(e.path);
      const textish = isTextMime(null, name);
      const existing = await vfs.getNodeByPath(userId, e.path);
      const content = textish ? utf8FromBytes(e.content) : bytesToBase64(e.content);
      const enc = textish ? "utf8" : "base64";
      if (existing && !existing.isDir) await vfs.writeFile(userId, e.path, content, enc);
      else if (!existing) created.push(await vfs.createFile(userId, parent, name, content, enc));
    }
    i += 1;
    if (onProgress) await onProgress(i / Math.max(1, entries.length));
  }
  return { created: created.length, skipped, dest };
}

export async function listZipEntries(userId: string, zipPath: string) {
  const file = await vfs.readFile(userId, zipPath);
  const bytes = file.encoding === "base64" ? base64ToBytes(file.content) : new TextEncoder().encode(file.content);
  const { entries, skipped, uncompressed } = decodeZip(bytes, "/inspect");
  return {
    path: file.path,
    name: file.name,
    size: file.size,
    uncompressed,
    entries: entries.map((e) => ({
      path: e.path.replace(/^\/inspect\/?/, ""),
      isDir: e.isDir,
      size: e.content.length,
    })),
    skipped,
  };
}

export async function bulkTag(userId: string, paths: string[], tags: string[]) {
  const r = emptyBulk<{ path: string; tags: string[] }>();
  for (const path of paths) {
    try {
      const out = await setTags(userId, path, tags);
      r.succeeded.push(out);
    } catch (err) {
      r.failed.push({ path, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  return finishBulk(r);
}
