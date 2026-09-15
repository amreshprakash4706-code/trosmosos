import { createHash } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { fail } from "./errors";
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_USER,
  MAX_STORAGE_BYTES,
  MAX_VERSIONS_PER_FILE,
  basename,
  extOf,
  isSystemPath,
  isTextMime,
  joinPath,
  mimeFromName,
  normalizePath,
  parentPath,
  safeName,
  uid,
  uniqueCandidate,
} from "./core";
import type { Json, VfsNode } from "./types";

export type { VfsNode } from "./types";

type NodeRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  parent_id: string | null;
  name: string;
  path: string;
  is_dir: boolean | number | string;
  mime_type: string | null;
  size: number | string;
  content: string | null;
  content_encoding: string | null;
  content_hash: string | null;
  is_trashed: boolean | number | string;
  trashed_at: string | null;
  original_path: string | null;
  version: number | string;
  metadata_json: string | null;
  accessed_at: string | null;
  created_at: string;
  updated_at: string;
};

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === "t" || v === "true" || v === "1";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function rowToNode(row: NodeRow | null | undefined): VfsNode | null {
  if (!row) return null;
  let metadata: { [key: string]: Json } | null = null;
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json) as { [key: string]: Json };
    } catch {
      metadata = null;
    }
  }
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    isDir: truthy(row.is_dir),
    mimeType: row.mime_type,
    size: num(row.size),
    isTrashed: truthy(row.is_trashed),
    version: num(row.version) || 1,
    contentHash: row.content_hash,
    metadata,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    accessedAt: row.accessed_at ? String(row.accessed_at) : null,
    originalPath: row.original_path,
    encoding: row.content_encoding === "base64" ? "base64" : "utf8",
  };
}

function hashContent(body: string): string {
  return createHash("sha256").update(body || "", "utf8").digest("hex");
}

function byteSize(body: string, encoding: "utf8" | "base64"): number {
  if (encoding === "base64") {
    const clean = body.replace(/\s/g, "");
    const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
  }
  return new TextEncoder().encode(body).length;
}

async function getRow(sql: Sql, userId: string, path: string, includeTrash = false): Promise<NodeRow | undefined> {
  const p = normalizePath(path);
  if (includeTrash) {
    const rows = await sql.query<NodeRow>(
      `select * from vfs_nodes where user_id = $1 and path = $2 limit 1`,
      [userId, p],
    );
    return rows[0];
  }
  const rows = await sql.query<NodeRow>(
    `select * from vfs_nodes where user_id = $1 and path = $2 and is_trashed = false limit 1`,
    [userId, p],
  );
  return rows[0];
}

async function storageUsed(sql: Sql, userId: string): Promise<number> {
  const rows = await sql.query<{ s: number | string }>(
    `select coalesce(sum(size), 0) as s from vfs_nodes where user_id = $1 and is_trashed = false`,
    [userId],
  );
  return num(rows[0]?.s);
}

async function fileCount(sql: Sql, userId: string): Promise<number> {
  const rows = await sql.query<{ c: number | string }>(
    `select count(*) as c from vfs_nodes where user_id = $1 and is_trashed = false`,
    [userId],
  );
  return num(rows[0]?.c);
}

async function enforceQuota(sql: Sql, userId: string, additionalBytes: number, additionalFiles = 0) {
  const used = await storageUsed(sql, userId);
  if (used + additionalBytes > MAX_STORAGE_BYTES) {
    fail(413, "Storage quota exceeded", "QUOTA");
  }
  const count = await fileCount(sql, userId);
  if (count + additionalFiles >= MAX_FILES_PER_USER) {
    fail(413, "Maximum number of files reached", "QUOTA");
  }
}

async function syncStorage(sql: Sql, userId: string) {
  const used = await storageUsed(sql, userId);
  await sql.query(`update os_profiles set storage_used = $1, updated_at = now() where user_id = $2`, [
    used,
    userId,
  ]);
}

export async function getNodeByPath(userId: string, path: string): Promise<VfsNode | null> {
  const sql = await getSql();
  return rowToNode((await getRow(sql, userId, path)) ?? null);
}

export async function listDirectory(
  userId: string,
  path = "/Home",
  opts: { sort?: string; q?: string } = {},
): Promise<VfsNode[]> {
  const sql = await getSql();
  const p = normalizePath(path);
  const parent = await getRow(sql, userId, p);
  if (!parent || !truthy(parent.is_dir)) fail(404, "Directory not found");
  let rows = await sql.query<NodeRow>(
    `select id, user_id, workspace_id, parent_id, name, path, is_dir, mime_type, size,
            content_encoding, content_hash, is_trashed, trashed_at, original_path, version,
            metadata_json, accessed_at, created_at, updated_at, content
       from vfs_nodes
      where user_id = $1 and parent_id = $2 and is_trashed = false
      order by is_dir desc, lower(name) asc`,
    [userId, parent.id],
  );
  if (opts.q) {
    const q = opts.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q));
  }
  const nodes = rows.map((r) => rowToNode(r)!);
  if (opts.sort === "size") nodes.sort((a, b) => b.size - a.size);
  else if (opts.sort === "modified") nodes.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  else if (opts.sort === "name") nodes.sort((a, b) => a.name.localeCompare(b.name));
  return nodes;
}

export async function createFolder(userId: string, parentPathInput: string, name: string): Promise<VfsNode> {
  const sql = await getSql();
  const parentP = normalizePath(parentPathInput || "/Home");
  const clean = safeName(name);
  const fullPath = joinPath(parentP, clean);
  if (await getRow(sql, userId, fullPath)) fail(409, "A file or folder with that name already exists");
  const parent = await getRow(sql, userId, parentP);
  if (!parent || !truthy(parent.is_dir)) fail(404, "Parent directory not found");
  await enforceQuota(sql, userId, 0, 1);
  const id = uid("fil");
  await sql.query(
    `insert into vfs_nodes (id, user_id, workspace_id, parent_id, name, path, is_dir, size, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,true,0,now(),now())`,
    [id, userId, parent.workspace_id, parent.id, clean, fullPath],
  );
  const node = await getNodeByPath(userId, fullPath);
  if (!node) fail(500, "Failed to create folder");
  return node;
}

export async function createFile(
  userId: string,
  parentPathInput: string,
  name: string,
  content = "",
  encoding: "utf8" | "base64" = "utf8",
): Promise<VfsNode> {
  const sql = await getSql();
  const parentP = normalizePath(parentPathInput || "/Home/Documents");
  const clean = safeName(name);
  const fullPath = joinPath(parentP, clean);
  const mime = mimeFromName(clean);
  const body = typeof content === "string" ? content : String(content ?? "");
  const enc = encoding === "base64" || !isTextMime(mime, clean) ? encoding : "utf8";
  const size = byteSize(body, enc);
  if (size > MAX_FILE_SIZE_BYTES) fail(413, `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES} bytes`);
  if (await getRow(sql, userId, fullPath)) fail(409, "A file or folder with that name already exists");
  const parent = await getRow(sql, userId, parentP);
  if (!parent || !truthy(parent.is_dir)) fail(404, "Parent directory not found");
  await enforceQuota(sql, userId, size, 1);
  const id = uid("fil");
  const hash = hashContent(body);
  await sql.query(
    `insert into vfs_nodes
      (id, user_id, workspace_id, parent_id, name, path, is_dir, mime_type, size, content, content_encoding, content_hash, version, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,false,$7,$8,$9,$10,$11,1,now(),now())`,
    [id, userId, parent.workspace_id, parent.id, clean, fullPath, mime, size, body, enc, hash],
  );
  await syncStorage(sql, userId);
  const node = await getNodeByPath(userId, fullPath);
  if (!node) fail(500, "Failed to create file");
  return node;
}

export async function readFile(userId: string, path: string) {
  const sql = await getSql();
  const row = await getRow(sql, userId, path);
  if (!row) fail(404, "File not found");
  if (truthy(row.is_dir)) fail(400, "Cannot read a directory as a file");
  await sql.query(`update vfs_nodes set accessed_at = now() where id = $1`, [row.id]);
  const node = rowToNode(row)!;
  return {
    ...node,
    content: row.content ?? "",
    encoding: (row.content_encoding === "base64" ? "base64" : "utf8") as "utf8" | "base64",
  };
}

export async function writeFile(userId: string, path: string, content: string, encoding?: "utf8" | "base64") {
  const sql = await getSql();
  const p = normalizePath(path);
  const row = await getRow(sql, userId, p);
  if (!row) fail(404, "File not found");
  if (truthy(row.is_dir)) fail(400, "Cannot write to a directory");
  const mime = row.mime_type || mimeFromName(row.name);
  const enc = encoding || (row.content_encoding === "base64" ? "base64" : "utf8");
  const body = String(content ?? "");
  const size = byteSize(body, enc);
  if (size > MAX_FILE_SIZE_BYTES) fail(413, `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES} bytes`);
  const delta = size - num(row.size);
  if (delta > 0) await enforceQuota(sql, userId, delta);
  const hash = hashContent(body);
  const nextVersion = (num(row.version) || 1) + 1;
  await sql.query(
    `insert into vfs_versions (id, file_id, user_id, version, size, content, content_encoding, content_hash, mime_type, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
    [
      uid("ver"),
      row.id,
      userId,
      num(row.version) || 1,
      num(row.size),
      row.content,
      row.content_encoding || "utf8",
      row.content_hash,
      row.mime_type,
    ],
  );
  const extra = await sql.query<{ c: number | string }>(
    `select count(*) as c from vfs_versions where file_id = $1`,
    [row.id],
  );
  const extraCount = num(extra[0]?.c);
  if (extraCount > MAX_VERSIONS_PER_FILE) {
    await sql.query(
      `delete from vfs_versions where id in (
         select id from vfs_versions where file_id = $1 order by version asc limit $2
       )`,
      [row.id, extraCount - MAX_VERSIONS_PER_FILE],
    );
  }
  await sql.query(
    `update vfs_nodes
        set content = $1, content_encoding = $2, size = $3, content_hash = $4, version = $5, mime_type = $6, updated_at = now()
      where id = $7 and user_id = $8`,
    [body, enc, size, hash, nextVersion, mime, row.id, userId],
  );
  await syncStorage(sql, userId);
  return readFile(userId, p);
}

export async function listVersions(userId: string, path: string) {
  const sql = await getSql();
  const row = await getRow(sql, userId, path);
  if (!row) fail(404, "File not found");
  const versions = await sql.query<{
    version: number;
    size: number;
    content_hash: string | null;
    mime_type: string | null;
    created_at: string;
  }>(
    `select version, size, content_hash, mime_type, created_at from vfs_versions
      where file_id = $1 and user_id = $2 order by version desc`,
    [row.id, userId],
  );
  return {
    path: normalizePath(path),
    currentVersion: num(row.version),
    versions: [
      {
        version: num(row.version),
        size: num(row.size),
        contentHash: row.content_hash,
        createdAt: String(row.updated_at),
        current: true,
      },
      ...versions.map((v) => ({
        version: num(v.version),
        size: num(v.size),
        contentHash: v.content_hash,
        mimeType: v.mime_type,
        createdAt: String(v.created_at),
        current: false,
      })),
    ],
  };
}

export async function restoreVersion(userId: string, path: string, versionNumber: number) {
  const sql = await getSql();
  const row = await getRow(sql, userId, path);
  if (!row) fail(404, "File not found");
  if (truthy(row.is_dir)) fail(400, "Cannot restore versions of a directory");
  const ver = Number(versionNumber);
  if (!Number.isFinite(ver) || ver < 1) fail(400, "Invalid version number");
  if (ver === num(row.version)) return readFile(userId, path);
  const snap = await sql.query<NodeRow>(
    `select * from vfs_versions where file_id = $1 and user_id = $2 and version = $3`,
    [row.id, userId, ver],
  );
  if (!snap[0]) fail(404, "Version not found");
  return writeFile(
    userId,
    path,
    snap[0].content ?? "",
    snap[0].content_encoding === "base64" ? "base64" : "utf8",
  );
}

export async function renameNode(userId: string, path: string, newName: string): Promise<VfsNode> {
  const sql = await getSql();
  const p = normalizePath(path);
  if (isSystemPath(p)) fail(403, "Cannot rename system folders");
  const row = await getRow(sql, userId, p);
  if (!row) fail(404, "Not found");
  const clean = safeName(newName);
  const parent = parentPath(p) || "/";
  const newPath = joinPath(parent, clean);
  if (newPath === p) return rowToNode(row)!;
  if (await getRow(sql, userId, newPath)) fail(409, "Name already exists");
  if (truthy(row.is_dir)) {
    const descendants = await sql.query<{ id: string; path: string }>(
      `select id, path from vfs_nodes where user_id = $1 and path like $2`,
      [userId, p + "/%"],
    );
    for (const d of descendants) {
      await sql.query(`update vfs_nodes set path = $1, updated_at = now() where id = $2`, [
        newPath + d.path.slice(p.length),
        d.id,
      ]);
    }
  }
  await sql.query(`update vfs_nodes set name = $1, path = $2, updated_at = now() where id = $3`, [
    clean,
    newPath,
    row.id,
  ]);
  const node = await getNodeByPath(userId, newPath);
  if (!node) fail(500, "Rename failed");
  return node;
}

export async function moveNode(userId: string, path: string, newParentPath: string): Promise<VfsNode> {
  const sql = await getSql();
  const p = normalizePath(path);
  const destParent = normalizePath(newParentPath || "/Home");
  if (isSystemPath(p)) fail(403, "Cannot move system folders");
  const row = await getRow(sql, userId, p);
  if (!row) fail(404, "Not found");
  const parentRow = await getRow(sql, userId, destParent);
  if (!parentRow || !truthy(parentRow.is_dir)) fail(404, "Destination directory not found");
  if (truthy(row.is_dir) && (destParent === p || destParent.startsWith(p + "/"))) {
    fail(400, "Cannot move a folder into itself");
  }
  const newPath = joinPath(destParent, row.name);
  if (await getRow(sql, userId, newPath)) fail(409, "An item with that name already exists in the destination");
  if (truthy(row.is_dir)) {
    const descendants = await sql.query<{ id: string; path: string }>(
      `select id, path from vfs_nodes where user_id = $1 and path like $2`,
      [userId, p + "/%"],
    );
    for (const d of descendants) {
      await sql.query(`update vfs_nodes set path = $1, updated_at = now() where id = $2`, [
        newPath + d.path.slice(p.length),
        d.id,
      ]);
    }
  }
  await sql.query(
    `update vfs_nodes set parent_id = $1, path = $2, workspace_id = $3, updated_at = now() where id = $4`,
    [parentRow.id, newPath, parentRow.workspace_id, row.id],
  );
  const node = await getNodeByPath(userId, newPath);
  if (!node) fail(500, "Move failed");
  return node;
}

export async function copyNode(
  userId: string,
  path: string,
  destParentPath: string,
  newName: string | null = null,
): Promise<VfsNode> {
  const sql = await getSql();
  const p = normalizePath(path);
  const destParent = normalizePath(destParentPath || "/Home");
  const src = await getRow(sql, userId, p);
  if (!src) fail(404, "Source not found");
  const parentRow = await getRow(sql, userId, destParent);
  if (!parentRow || !truthy(parentRow.is_dir)) fail(404, "Destination directory not found");
  const targetName = safeName(newName || src.name);
  const newPath = joinPath(destParent, targetName);
  if (await getRow(sql, userId, newPath)) fail(409, "An item with that name already exists in the destination");
  const toCopy: NodeRow[] = [src];
  if (truthy(src.is_dir)) {
    const kids = await sql.query<NodeRow>(
      `select * from vfs_nodes where user_id = $1 and path like $2 and is_trashed = false order by path`,
      [userId, p + "/%"],
    );
    toCopy.push(...kids);
  }
  let totalSize = 0;
  for (const n of toCopy) totalSize += num(n.size);
  await enforceQuota(sql, userId, totalSize, toCopy.length);
  const idMap = new Map<string, string>();
  for (const n of toCopy) {
    const relative = n.path === p ? "" : n.path.slice(p.length);
    const destPath = newPath + relative;
    const newId = uid("fil");
    idMap.set(n.id, newId);
    const newParentId = n.id === src.id ? parentRow.id : idMap.get(n.parent_id || "") || parentRow.id;
    await sql.query(
      `insert into vfs_nodes
        (id, user_id, workspace_id, parent_id, name, path, is_dir, mime_type, size, content, content_encoding, content_hash, version, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,now(),now())`,
      [
        newId,
        userId,
        parentRow.workspace_id,
        newParentId,
        n.id === src.id ? targetName : n.name,
        destPath,
        truthy(n.is_dir),
        n.mime_type,
        num(n.size),
        n.content,
        n.content_encoding || "utf8",
        n.content_hash,
      ],
    );
  }
  await syncStorage(sql, userId);
  const node = await getNodeByPath(userId, newPath);
  if (!node) fail(500, "Copy failed");
  return node;
}

export async function trashNode(userId: string, path: string) {
  const sql = await getSql();
  const p = normalizePath(path);
  if (isSystemPath(p)) fail(403, "Cannot delete system folders");
  const row = await getRow(sql, userId, p);
  if (!row) fail(404, "Not found");
  const trashRoot = await getRow(sql, userId, "/Trash");
  const nodes = await sql.query<NodeRow>(
    `select * from vfs_nodes where user_id = $1 and is_trashed = false and (path = $2 or path like $3) order by path`,
    [userId, p, p + "/%"],
  );
  for (const n of nodes) {
    const relative = n.path === p ? "" : n.path.slice(p.length);
    const trashPath = n.path === p ? `/Trash/${n.id}_${n.name}` : `/Trash/${row.id}_${row.name}${relative}`;
    const newParent = n.path === p ? trashRoot?.id || null : n.parent_id;
    await sql.query(
      `update vfs_nodes
          set is_trashed = true, trashed_at = now(), original_path = $1, path = $2, parent_id = $3, updated_at = now()
        where id = $4`,
      [n.path, trashPath, newParent, n.id],
    );
  }
  return { ok: true as const, path: p };
}

export async function restoreNode(userId: string, path: string): Promise<VfsNode> {
  const sql = await getSql();
  const p = normalizePath(path);
  let row =
    (
      await sql.query<NodeRow>(
        `select * from vfs_nodes where user_id = $1 and path = $2 and is_trashed = true limit 1`,
        [userId, p],
      )
    )[0] ||
    (
      await sql.query<NodeRow>(
        `select * from vfs_nodes where user_id = $1 and original_path = $2 and is_trashed = true limit 1`,
        [userId, p],
      )
    )[0];
  if (!row) fail(404, "Not found in trash");
  const targetPath = row.original_path || p;
  if (await getRow(sql, userId, targetPath)) fail(409, "A non-trashed item already exists at this path");
  const parent = parentPath(targetPath);
  if (parent && parent !== "/") {
    const parentLive = await getRow(sql, userId, parent);
    if (!parentLive || !truthy(parentLive.is_dir)) {
      fail(409, "Cannot restore: original parent directory is missing");
    }
  }
  const trashPrefix = row.path;
  const nodes = await sql.query<NodeRow>(
    `select * from vfs_nodes where user_id = $1 and is_trashed = true and (path = $2 or path like $3) order by path`,
    [userId, trashPrefix, trashPrefix + "/%"],
  );
  for (const n of nodes) {
    const orig = n.original_path;
    if (!orig) continue;
    let parentId: string | null = null;
    const pp = parentPath(orig);
    if (pp && pp !== "/") {
      const pr =
        (await getRow(sql, userId, pp)) ||
        (
          await sql.query<NodeRow>(`select * from vfs_nodes where user_id = $1 and original_path = $2 limit 1`, [
            userId,
            pp,
          ])
        )[0];
      parentId = pr?.id || null;
    }
    if (n.id === row.id && parent && parent !== "/") {
      const pr = await getRow(sql, userId, parent);
      parentId = pr?.id || null;
    }
    await sql.query(
      `update vfs_nodes set is_trashed = false, trashed_at = null, path = $1, original_path = null, parent_id = $2, updated_at = now() where id = $3`,
      [orig, parentId, n.id],
    );
  }
  const node = await getNodeByPath(userId, targetPath);
  if (!node) fail(500, "Restore failed");
  return node;
}

export async function permanentlyDelete(userId: string, path: string) {
  const sql = await getSql();
  const p = normalizePath(path);
  if (isSystemPath(p)) fail(403, "Cannot permanently delete system folders");
  let root =
    (await sql.query<NodeRow>(`select * from vfs_nodes where user_id = $1 and path = $2 limit 1`, [userId, p]))[0] ||
    (
      await sql.query<NodeRow>(`select * from vfs_nodes where user_id = $1 and original_path = $2 limit 1`, [
        userId,
        p,
      ])
    )[0];
  if (!root) fail(404, "Not found");
  const prefix = root.path;
  await sql.query(`delete from vfs_nodes where user_id = $1 and (path = $2 or path like $3)`, [
    userId,
    prefix,
    prefix + "/%",
  ]);
  await syncStorage(sql, userId);
  return { ok: true as const };
}

export async function emptyTrash(userId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(`select id from vfs_nodes where user_id = $1 and is_trashed = true`, [
    userId,
  ]);
  await sql.query(`delete from vfs_nodes where user_id = $1 and is_trashed = true`, [userId]);
  await syncStorage(sql, userId);
  return { ok: true as const, deleted: rows.length };
}

export async function listTrash(userId: string): Promise<VfsNode[]> {
  const sql = await getSql();
  const all = await sql.query<NodeRow>(
    `select * from vfs_nodes where user_id = $1 and is_trashed = true order by trashed_at desc`,
    [userId],
  );
  const trashedIds = new Set(all.map((r) => r.id));
  return all
    .filter((r) => !r.parent_id || !trashedIds.has(r.parent_id))
    .map((r) => {
      const node = rowToNode(r)!;
      if (r.original_path) node.path = r.original_path;
      node.trashPath = r.path;
      node.originalPath = r.original_path;
      return node;
    });
}

export async function searchFiles(userId: string, query: string, limit = 50): Promise<VfsNode[]> {
  const sql = await getSql();
  const raw = String(query || "").trim();
  if (!raw) return [];
  const q = `%${raw}%`;
  const cap = Math.min(limit, 100);
  const byName = await sql.query<NodeRow>(
    `select id, user_id, workspace_id, parent_id, name, path, is_dir, mime_type, size, content_encoding, content_hash,
            is_trashed, trashed_at, original_path, version, metadata_json, accessed_at, created_at, updated_at, content
       from vfs_nodes
      where user_id = $1 and is_trashed = false and (name ilike $2 or path ilike $2)
      order by is_dir desc, lower(name) asc
      limit $3`,
    [userId, q, cap],
  );
  const nodes = byName.map((r) => rowToNode(r)!);
  if (nodes.length >= cap || raw.length < 2) return nodes;
  const seen = new Set(nodes.map((n) => n.id));
  const contentHits = await sql.query<NodeRow>(
    `select id, user_id, workspace_id, parent_id, name, path, is_dir, mime_type, size, content_encoding, content_hash,
            is_trashed, trashed_at, original_path, version, metadata_json, accessed_at, created_at, updated_at, content
       from vfs_nodes
      where user_id = $1 and is_trashed = false and is_dir = false and content is not null and content ilike $2
      limit $3`,
    [userId, q, cap],
  );
  for (const row of contentHits) {
    if (seen.has(row.id)) continue;
    nodes.push(rowToNode(row)!);
    seen.add(row.id);
    if (nodes.length >= cap) break;
  }
  return nodes;
}

export async function getTree(userId: string, root = "/Home"): Promise<VfsNode[]> {
  const sql = await getSql();
  const p = normalizePath(root);
  const rows = await sql.query<NodeRow>(
    `select id, user_id, workspace_id, parent_id, name, path, is_dir, mime_type, size, content_encoding, content_hash,
            is_trashed, trashed_at, original_path, version, metadata_json, accessed_at, created_at, updated_at, content
       from vfs_nodes
      where user_id = $1 and is_trashed = false and (path = $2 or path like $3)
      order by path`,
    [userId, p, p + "/%"],
  );
  return rows.map((r) => rowToNode(r)!);
}

export async function getStorageStats(userId: string) {
  const sql = await getSql();
  const used = await storageUsed(sql, userId);
  const count = await fileCount(sql, userId);
  const profile = await sql.query<{ storage_used: number | string }>(
    `select storage_used from os_profiles where user_id = $1`,
    [userId],
  );
  return {
    used,
    profileUsed: num(profile[0]?.storage_used),
    limit: MAX_STORAGE_BYTES,
    files: count,
    maxFiles: MAX_FILES_PER_USER,
    maxFileSize: MAX_FILE_SIZE_BYTES,
  };
}

export async function setFavorite(userId: string, path: string, title?: string, on = true) {
  const sql = await getSql();
  const p = normalizePath(path);
  if (on) {
    const node = await getRow(sql, userId, p);
    await sql.query(
      `insert into favorites (user_id, path, title, created_at) values ($1,$2,$3,now())
       on conflict (user_id, path) do update set title = excluded.title`,
      [userId, p, title || node?.name || basename(p)],
    );
  } else {
    await sql.query(`delete from favorites where user_id = $1 and path = $2`, [userId, p]);
  }
  return { ok: true as const, path: p, favorite: on };
}

export async function listFavorites(userId: string) {
  const sql = await getSql();
  return sql.query<{ path: string; title: string | null; created_at: string }>(
    `select path, title, created_at from favorites where user_id = $1 order by created_at desc`,
    [userId],
  );
}

export async function touchRecent(userId: string, kind: string, ref: string, title: string, path?: string) {
  const sql = await getSql();
  await sql.query(`delete from recent_items where user_id = $1 and kind = $2 and ref = $3`, [userId, kind, ref]);
  await sql.query(
    `insert into recent_items (id, user_id, kind, ref, title, path, accessed_at) values ($1,$2,$3,$4,$5,$6,now())`,
    [uid("rec"), userId, kind, ref, title, path || null],
  );
  await sql.query(
    `delete from recent_items where id in (
       select id from recent_items where user_id = $1 order by accessed_at desc offset 80
     )`,
    [userId],
  );
}

export async function listRecent(userId: string, limit = 40) {
  const sql = await getSql();
  return sql.query(
    `select id, kind, ref, title, path, accessed_at from recent_items where user_id = $1 order by accessed_at desc limit $2`,
    [userId, Math.min(limit, 80)],
  );
}

export async function mkdirp(userId: string, path: string): Promise<VfsNode> {
  const sql = await getSql();
  const p = normalizePath(path);
  const existing = await getRow(sql, userId, p);
  if (existing) {
    if (!truthy(existing.is_dir)) fail(409, "A file exists at this path");
    return rowToNode(existing)!;
  }
  const parts = p.split("/").filter(Boolean);
  let cur = "/";
  let parentId: string | null = null;
  let workspaceId: string | null = null;
  let last: NodeRow | undefined;
  for (const part of parts) {
    cur = joinPath(cur, part);
    const row = await getRow(sql, userId, cur);
    if (row) {
      if (!truthy(row.is_dir)) fail(409, "A file exists at this path");
      parentId = row.id;
      workspaceId = row.workspace_id;
      last = row;
      continue;
    }
    const id = uid("fil");
    await sql.query(
      `insert into vfs_nodes (id, user_id, workspace_id, parent_id, name, path, is_dir, size, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,true,0,now(),now())`,
      [id, userId, workspaceId, parentId, part, cur],
    );
    parentId = id;
    last = {
      id,
      user_id: userId,
      workspace_id: workspaceId,
      parent_id: parentId,
      name: part,
      path: cur,
      is_dir: true,
      mime_type: null,
      size: 0,
      content: null,
      content_encoding: "utf8",
      content_hash: null,
      is_trashed: false,
      trashed_at: null,
      original_path: null,
      version: 1,
      metadata_json: null,
      accessed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  return rowToNode(last)!;
}

export function uniqueNameFromList(name: string, existing: string[]): string {
  return uniqueCandidate(
    safeName(name),
    new Set(existing.map((n) => n)),
  );
}

export { extOf };
