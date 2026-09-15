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
};

export type SearchHit = {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  path?: string;
  score?: number;
};
