/** Shared Trosmos types safe for client + server imports. */

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type VfsNode = {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  mimeType: string | null;
  size: number;
  isTrashed: boolean;
  version: number;
  contentHash: string | null;
  metadata: { [key: string]: Json } | null;
  createdAt: string;
  updatedAt: string;
  accessedAt: string | null;
  originalPath?: string | null;
  trashPath?: string | null;
  encoding?: "utf8" | "base64";
  tags?: string[];
  thumbnail?: string | null;
};

export type SearchHit = {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  path?: string;
  score?: number;
  snippet?: string;
};

export type ShareGrant = {
  id: string;
  token: string;
  path: string;
  title: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  accessCount: number;
  createdAt: string;
};

export type FileComment = {
  id: string;
  path: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type DesktopIcon = {
  id: string;
  appId?: string;
  path?: string;
  kind: "app" | "file";
  x: number;
  y: number;
  label?: string;
};

export type ConflictAction = "overwrite" | "rename" | "skip";
