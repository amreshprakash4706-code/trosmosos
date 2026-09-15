/** Path, identity, MIME, hashing, and ranking primitives shared by client + server. */

export const OS_NAME = "Trosmos OS";
export const OS_VERSION = "5.0.0";
export const MAX_FILE_SIZE_BYTES = 1_500_000;
export const MAX_STORAGE_BYTES = 52_428_800;
export const MAX_FILES_PER_USER = 4000;
export const MAX_VERSIONS_PER_FILE = 20;
export const SYSTEM_PATHS = new Set(["/", "/Home", "/Trash"]);

export function uid(prefix = ""): string {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(16).slice(2) + Date.now().toString(16);
  return prefix ? `${prefix}_${id.slice(0, 24)}` : id;
}

export function safeName(name: unknown): string {
  const cleaned = String(name ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 255);
  return cleaned || "untitled";
}

export function normalizePath(input: unknown): string {
  let p = String(input || "/").replace(/\\/g, "/");
  if (!p.startsWith("/")) p = "/" + p;
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return "/" + parts.join("/");
}

export function parentPath(path: unknown): string | null {
  const n = normalizePath(path);
  if (n === "/") return null;
  const idx = n.lastIndexOf("/");
  return idx <= 0 ? "/" : n.slice(0, idx);
}

export function joinPath(...parts: unknown[]): string {
  const joined = parts
    .map((p) => String(p ?? "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return normalizePath("/" + joined);
}

export function basename(path: unknown): string {
  const n = normalizePath(path);
  if (n === "/") return "";
  return n.slice(n.lastIndexOf("/") + 1);
}

export function isSystemPath(path: unknown): boolean {
  return SYSTEM_PATHS.has(normalizePath(path));
}

export function isDescendantPath(parent: string, maybeChild: string): boolean {
  const p = normalizePath(parent);
  const c = normalizePath(maybeChild);
  if (p === "/") return c !== "/";
  return c === p || c.startsWith(p + "/");
}

const MIME: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  jsx: "text/javascript",
  svg: "image/svg+xml",
  csv: "text/csv",
  xml: "application/xml",
  yml: "text/yaml",
  yaml: "text/yaml",
  toml: "text/plain",
  ini: "text/plain",
  log: "text/plain",
  sh: "text/x-shellscript",
  py: "text/x-python",
  rb: "text/x-ruby",
  go: "text/x-go",
  rs: "text/x-rust",
  c: "text/x-c",
  h: "text/x-c",
  cpp: "text/x-c",
  java: "text/x-java",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  zip: "application/zip",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
};

const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "ts",
  "tsx",
  "jsx",
  "svg",
  "csv",
  "xml",
  "yml",
  "yaml",
  "toml",
  "ini",
  "log",
  "sh",
  "py",
  "rb",
  "go",
  "rs",
  "c",
  "h",
  "cpp",
  "java",
]);

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function mimeFromName(name: string): string {
  return MIME[extOf(name)] || "application/octet-stream";
}

export function isTextMime(mime: string | null | undefined, name?: string): boolean {
  if (name && TEXT_EXT.has(extOf(name))) return true;
  if (!mime) return false;
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/javascript" ||
    mime === "application/xml" ||
    mime === "image/svg+xml" ||
    mime === "application/xml"
  );
}

export function uniqueCandidate(original: string, taken: Set<string>): string {
  if (!taken.has(original)) return original;
  const i = original.lastIndexOf(".");
  const stem = i > 0 ? original.slice(0, i) : original;
  const ext = i > 0 ? original.slice(i) : "";
  let n = 1;
  while (n < 500) {
    const next = `${stem} (${n})${ext}`;
    if (!taken.has(next)) return next;
    n += 1;
  }
  return `${stem}-${Date.now()}${ext}`;
}

export type RankedHit = {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  path?: string;
  score: number;
};

export function scoreMatch(query: string, ...fields: Array<string | null | undefined>): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    const t = field.toLowerCase();
    if (t === q) best = Math.max(best, 100);
    else if (t.startsWith(q)) best = Math.max(best, 80);
    else if (t.includes(q)) best = Math.max(best, 55);
    else if (fuzzyIncludes(t, q)) best = Math.max(best, 30);
  }
  return best;
}

export function fuzzyIncludes(hay: string, needle: string): boolean {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i += 1;
    if (i >= needle.length) return true;
  }
  return false;
}

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function sha256Hex(input: string): string {
  // Tiny non-crypto fallback for environments without SubtleCrypto sync hashing.
  // Server code should prefer node:crypto; this is for isomorphic previews.
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + String(input.length);
}

export const DEFAULT_SETTINGS = {
  accentColor: "#3B82F6",
  wallpaper: "aurora" as "aurora" | "nebula" | "dusk" | "void",
  reduceMotion: false,
  dockMagnify: true,
  dockPosition: "bottom" as "bottom" | "left",
  clockFormat: "24h" as "12h" | "24h",
  theme: "dark" as "dark" | "light",
  snapWindows: true,
  showDesktopIcons: true,
  notificationsEnabled: true,
  browserNotifications: false,
  aiConfirmMutations: true,
  aiModel: "grok-4.5",
  editorWordWrap: true,
  editorFontSize: 13,
  editorTabSize: 2,
  highContrast: false,
  largePointer: false,
  compactDock: false,
  defaultWorkspace: null as string | null,
};

export type OsSettings = typeof DEFAULT_SETTINGS;
