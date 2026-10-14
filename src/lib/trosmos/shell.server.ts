import { joinPath, normalizePath, parentPath, OS_VERSION } from "./core";
import { parsePipeline, HELP, isBuiltin } from "./terminal";
import * as vfs from "./vfs.server";
import * as platform from "./platform.server";
import { fail } from "./errors";

export type ShellState = { cwd: string };

export type ShellResult = {
  cwd: string;
  stdout: string;
  stderr?: string;
  open?: { appId: string; path?: string };
};

function resolve(cwd: string, p?: string | null): string {
  if (!p || p === ".") return cwd;
  if (p === "..") return parentPath(cwd) || "/";
  if (p.startsWith("/")) return normalizePath(p);
  return joinPath(cwd, p);
}

function flagNumber(flags: Record<string, string | boolean>, keys: string[], fallback: number): number {
  for (const k of keys) {
    const v = flags[k];
    if (typeof v === "string" && Number.isFinite(Number(v))) return Number(v);
  }
  return fallback;
}

export async function runShell(userId: string, input: string, cwdIn: string): Promise<ShellResult> {
  let cwd = normalizePath(cwdIn || "/Home");
  let line = input.trim();
  if (!line) return { cwd, stdout: "" };

  const extra = await import("./platform-extra.server");
  try {
    await extra.pushShellHistory(userId, line, cwd);
  } catch {
    /* history is best-effort */
  }

  if (!line.startsWith("alias ")) {
    try {
      const aliases = (await extra.listAliases(userId)) as Array<{ name: string; command: string }>;
      const first = line.split(/\s+/)[0];
      const hit = aliases.find((a) => a.name === first);
      if (hit) line = hit.command + line.slice(first.length);
    } catch {
      /* aliases table may be missing before migrate */
    }
  }

  const pipe = parsePipeline(line);
  if (!pipe.commands.length) return { cwd, stdout: "" };

  let stdin = "";
  let last: ShellResult = { cwd, stdout: "" };

  for (let i = 0; i < pipe.commands.length; i++) {
    const cmd = pipe.commands[i];
    const isLast = i === pipe.commands.length - 1;
    last = await execOne(userId, cmd, cwd, stdin);
    cwd = last.cwd;
    if (cmd.redirect && isLast) {
      const target = resolve(cwd, cmd.redirect.path);
      const parent = parentPath(target) || "/Home";
      const name = target.slice(target.lastIndexOf("/") + 1);
      const existing = await vfs.getNodeByPath(userId, target);
      let content = last.stdout;
      if (cmd.redirect.mode === "append" && existing && !existing.isDir) {
        const cur = await vfs.readFile(userId, target);
        content = cur.content + (cur.content.endsWith("\n") ? "" : "\n") + last.stdout;
        await vfs.writeFile(userId, target, content);
      } else if (existing && !existing.isDir) {
        await vfs.writeFile(userId, target, content);
      } else {
        await vfs.createFile(userId, parent, name, content);
      }
      last = { ...last, stdout: "" };
    }
    stdin = last.stdout;
  }
  return last;
}

async function execOne(
  userId: string,
  cmd: { name: string; args: string[]; flags: Record<string, string | boolean>; positionals: string[] },
  cwd: string,
  stdin: string,
): Promise<ShellResult> {
  const name = cmd.name;
  const p = cmd.positionals;
  const flags = cmd.flags;

  if (!name) return { cwd, stdout: "" };
  if (name === "help" || name === "man") {
    if (p[0]) return { cwd, stdout: HELP[p[0]] || `No help for ${p[0]}` };
    return {
      cwd,
      stdout: Object.values(HELP).join("\n") + "\n\nThis is the Trosmos shell, not a host OS shell.",
    };
  }
  if (name === "echo") return { cwd, stdout: cmd.args.join(" ") };
  if (name === "pwd") return { cwd, stdout: cwd };
  if (name === "cd") {
    const dest = resolve(cwd, p[0] || "/Home");
    const node = await vfs.getNodeByPath(userId, dest);
    if (!node || !node.isDir) return { cwd, stdout: "", stderr: `cd: no such directory: ${dest}` };
    return { cwd: dest, stdout: "" };
  }
  if (name === "ls") {
    const dest = resolve(cwd, p[0]);
    const items = await vfs.listDirectory(userId, dest);
    if (flags.l) {
      return {
        cwd,
        stdout: items
          .map((n) => `${n.isDir ? "d" : "-"} ${String(n.size).padStart(8)}  ${n.updatedAt}  ${n.name}`)
          .join("\n"),
      };
    }
    return { cwd, stdout: items.map((n) => (n.isDir ? n.name + "/" : n.name)).join("  ") };
  }
  if (name === "cat") {
    if (stdin && !p[0]) return { cwd, stdout: stdin };
    if (!p[0]) return { cwd, stdout: "", stderr: "cat: path required" };
    const file = await vfs.readFile(userId, resolve(cwd, p[0]));
    if (file.encoding === "base64") return { cwd, stdout: "", stderr: "cat: binary file" };
    return { cwd, stdout: file.content };
  }
  if (name === "head" || name === "tail") {
    const nFlag = flagNumber(flags, ["n"], 10);
    const text = p[0] ? (await vfs.readFile(userId, resolve(cwd, p[0]))).content : stdin;
    const lines = text.split("\n");
    const slice = name === "head" ? lines.slice(0, nFlag) : lines.slice(-nFlag);
    return { cwd, stdout: slice.join("\n") };
  }
  if (name === "wc") {
    const text = p[0] ? (await vfs.readFile(userId, resolve(cwd, p[0]))).content : stdin;
    const lines = text ? text.split("\n").length : 0;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const bytes = new TextEncoder().encode(text).length;
    return { cwd, stdout: `${lines} ${words} ${bytes}${p[0] ? " " + p[0] : ""}` };
  }
  if (name === "touch") {
    if (!p[0]) return { cwd, stdout: "", stderr: "touch: name required" };
    const dest = resolve(cwd, p[0]);
    const existing = await vfs.getNodeByPath(userId, dest);
    if (existing) return { cwd, stdout: "" };
    await vfs.createFile(userId, cwd, p[0], "");
    return { cwd, stdout: "" };
  }
  if (name === "mkdir") {
    if (!p[0]) return { cwd, stdout: "", stderr: "mkdir: name required" };
    await vfs.createFolder(userId, cwd, p[0]);
    return { cwd, stdout: "" };
  }
  if (name === "rm") {
    if (!p[0]) return { cwd, stdout: "", stderr: "rm: path required" };
    const dest = resolve(cwd, p[0]);
    if (flags.permanent) await vfs.permanentlyDelete(userId, dest);
    else await vfs.trashNode(userId, dest);
    return { cwd, stdout: "" };
  }
  if (name === "mv") {
    if (p.length < 2) return { cwd, stdout: "", stderr: "mv: src dest required" };
    const src = resolve(cwd, p[0]);
    const dest = resolve(cwd, p[1]);
    const destNode = await vfs.getNodeByPath(userId, dest);
    if (destNode?.isDir) await vfs.moveNode(userId, src, dest);
    else {
      const parent = parentPath(dest) || cwd;
      const moved = await vfs.moveNode(userId, src, parent);
      if (moved.name !== dest.slice(dest.lastIndexOf("/") + 1)) {
        await vfs.renameNode(userId, moved.path, dest.slice(dest.lastIndexOf("/") + 1));
      }
    }
    return { cwd, stdout: "" };
  }
  if (name === "cp") {
    if (p.length < 2) return { cwd, stdout: "", stderr: "cp: src dest required" };
    const src = resolve(cwd, p[0]);
    const dest = resolve(cwd, p[1]);
    const destNode = await vfs.getNodeByPath(userId, dest);
    if (destNode?.isDir) await vfs.copyNode(userId, src, dest);
    else await vfs.copyNode(userId, src, parentPath(dest) || cwd, dest.slice(dest.lastIndexOf("/") + 1));
    return { cwd, stdout: "" };
  }
  if (name === "stat") {
    const dest = resolve(cwd, p[0] || ".");
    const node = await vfs.getNodeByPath(userId, dest);
    if (!node) return { cwd, stdout: "", stderr: "stat: not found" };
    return { cwd, stdout: JSON.stringify(node, null, 2) };
  }
  if (name === "tree") {
    const dest = resolve(cwd, p[0]);
    const tree = await vfs.getTree(userId, dest);
    const lines = tree.map((n) => {
      const rel = n.path === dest ? "." : n.path.slice(dest.length).replace(/^\//, "");
      const depth = rel === "." ? 0 : rel.split("/").length;
      const pad = "  ".repeat(Math.max(0, depth - 1));
      return `${pad}${n.isDir ? n.name + "/" : n.name}`;
    });
    return { cwd, stdout: lines.join("\n") };
  }
  if (name === "find") {
    const dest = resolve(cwd, p[1] ? p[0] : cwd);
    const q = p[1] || p[0] || "";
    const tree = await vfs.getTree(userId, dest);
    const needle = (q || "").toLowerCase();
    const hits = needle ? tree.filter((h) => h.name.toLowerCase().includes(needle) || h.path.toLowerCase().includes(needle)) : tree;
    return { cwd, stdout: hits.map((h) => h.path).join("\n") };
  }
  if (name === "grep") {
    const q = p[0];
    if (!q) return { cwd, stdout: "", stderr: "grep: query required" };
    if (p[1] || !stdin) {
      const dest = resolve(cwd, p[1] || cwd);
      const node = await vfs.getNodeByPath(userId, dest);
      if (node && !node.isDir) {
        const file = await vfs.readFile(userId, dest);
        if (file.encoding === "base64") return { cwd, stdout: "", stderr: "grep: binary file" };
        const lines = file.content
          .split("\n")
          .map((l, i) => ({ l, i }))
          .filter((x) => x.l.toLowerCase().includes(q.toLowerCase()))
          .map((x) => `${dest}:${x.i + 1}:${x.l}`);
        return { cwd, stdout: lines.join("\n") };
      }
      const tree = await vfs.getTree(userId, dest);
      const out: string[] = [];
      for (const n of tree) {
        if (n.isDir) continue;
        try {
          const file = await vfs.readFile(userId, n.path);
          if (file.encoding === "base64") continue;
          file.content.split("\n").forEach((line, i) => {
            if (line.toLowerCase().includes(q.toLowerCase())) out.push(`${n.path}:${i + 1}:${line}`);
          });
        } catch {
          /* skip */
        }
      }
      return { cwd, stdout: out.join("\n") };
    }
    const lines = stdin
      .split("\n")
      .filter((l) => l.toLowerCase().includes(q.toLowerCase()));
    return { cwd, stdout: lines.join("\n") };
  }
  if (name === "whoami") {
    const profile = await platform.getProfile(userId);
    return { cwd, stdout: profile?.display_name || profile?.username || userId };
  }
  if (name === "date") return { cwd, stdout: new Date().toISOString() };
  if (name === "uname" || name === "version") return { cwd, stdout: `Trosmos OS ${OS_VERSION}` };
  if (name === "df" || name === "du") {
    const stats = await vfs.getStorageStats(userId);
    return {
      cwd,
      stdout: `used ${stats.used} / ${stats.limit} bytes · ${stats.files} files`,
    };
  }
  if (name === "apps") {
    const apps = await platform.listInstalledApps(userId);
    return { cwd, stdout: apps.map((a) => `${a.enabled ? "on " : "off"}  ${a.id}\t${a.name}`).join("\n") };
  }
  if (name === "open") {
    if (!p[0]) return { cwd, stdout: "", stderr: "open: app or path required" };
    const target = p[0];
    if (target.includes("/") || target.includes(".")) {
      return { cwd, stdout: `open ${resolve(cwd, target)}`, open: { appId: "files", path: resolve(cwd, target) } };
    }
    return { cwd, stdout: `launch ${target}`, open: { appId: target } };
  }
  if (name === "notes") {
    if (p[0] === "new") {
      const note = await platform.createNote(userId, { title: p.slice(1).join(" ") || "Untitled" });
      return { cwd, stdout: `created ${(note as { title: string }).title}` };
    }
    const notes = await platform.listNotes(userId);
    return {
      cwd,
      stdout: (notes as Array<{ title: string }>).map((n) => n.title).join("\n"),
    };
  }
  if (name === "tasks") {
    if (p[0] === "add") {
      const t = await platform.createTodo(userId, { title: p.slice(1).join(" ") || "Task" });
      return { cwd, stdout: `created ${(t as { title: string }).title}` };
    }
    const todos = await platform.listTodos(userId);
    return {
      cwd,
      stdout: (todos as Array<{ status: string; title: string }>).map((t) => `[${t.status}] ${t.title}`).join("\n"),
    };
  }
  if (name === "search") {
    const out = await platform.unifiedSearch(userId, p.join(" "));
    return {
      cwd,
      stdout: out.results.map((r) => `${r.kind}\t${r.title}\t${r.subtitle || ""}`).join("\n"),
    };
  }
  if (name === "jobs") {
    await platform.drainJobs(userId);
    const jobs = await platform.listJobs(userId);
    return {
      cwd,
      stdout: (jobs as Array<{ status: string; title: string; progress: number }>).map((j) => `${j.status}\t${Math.round((j.progress || 0) * 100)}%\t${j.title}`).join("\n"),
    };
  }
  if (name === "settings") {
    const s = await platform.getSettings(userId);
    return { cwd, stdout: JSON.stringify(s, null, 2) };
  }
  if (name === "notify") {
    await platform.createNotification(userId, { title: p.join(" ") || "Notice", category: "shell" });
    return { cwd, stdout: "ok" };
  }
  if (name === "export") {
    const job = await platform.enqueueJob(userId, { type: "export_backup", title: "Export backup" });
    return { cwd, stdout: `queued ${(job as { id: string }).id}` };
  }
  if (name === "ai") {
    return { cwd, stdout: "", stderr: "Use the Trosmos AI app for model conversations. The shell does not spend AI quota on its own." };
  }
  if (name === "history") {
    const extra = await import("./platform-extra.server");
    const rows = (await extra.listShellHistory(userId)) as Array<{ command: string }>;
    return { cwd, stdout: rows.map((r, i) => `${rows.length - i}  ${r.command}`).join("\n") };
  }
  if (name === "alias") {
    const extra = await import("./platform-extra.server");
    if (!p[0]) {
      const rows = (await extra.listAliases(userId)) as Array<{ name: string; command: string }>;
      return { cwd, stdout: rows.map((a) => `${a.name}='${a.command}'`).join("\n") };
    }
    const spec = p.join(" ");
    const eq = spec.indexOf("=");
    if (eq > 0) {
      await extra.setAlias(userId, spec.slice(0, eq), spec.slice(eq + 1).replace(/^['"]|['"]$/g, ""));
      return { cwd, stdout: "ok" };
    }
    return { cwd, stdout: "", stderr: "alias: use name=command" };
  }
  if (name === "unalias") {
    const extra = await import("./platform-extra.server");
    if (!p[0]) return { cwd, stdout: "", stderr: "unalias: name required" };
    await extra.deleteAlias(userId, p[0]);
    return { cwd, stdout: "ok" };
  }
  if (name === "zip") {
    if (!p.length) return { cwd, stdout: "", stderr: "zip: path required" };
    const paths = p.map((x) => resolve(cwd, x));
    const job = await platform.enqueueJob(userId, {
      type: "zip_create",
      title: `ZIP ${paths.length} item(s)`,
      payload: { paths, dest: cwd, name: "archive.zip" },
    });
    return { cwd, stdout: `queued ${(job as { id: string }).id}` };
  }
  if (name === "unzip") {
    if (!p[0]) return { cwd, stdout: "", stderr: "unzip: archive path required" };
    const dest = p[1] ? resolve(cwd, p[1]) : cwd;
    const job = await platform.enqueueJob(userId, {
      type: "zip_extract",
      title: `Extract ${p[0]}`,
      payload: { path: resolve(cwd, p[0]), dest },
    });
    return { cwd, stdout: `queued ${(job as { id: string }).id}` };
  }
  if (name === "clear") {
    return { cwd, stdout: "" };
  }
  if (!isBuiltin(name)) {
    return { cwd, stdout: "", stderr: `${name}: command not found. Try help.` };
  }
  return { cwd, stdout: "", stderr: `${name}: not implemented` };
}

export { fail };
