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

export async function runShell(userId: string, input: string, cwdIn: string): Promise<ShellResult> {
  let cwd = normalizePath(cwdIn || "/Home");
  const line = input.trim();
  if (!line) return { cwd, stdout: "" };
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
    const text = p[0] ? (await vfs.readFile(userId, resolve(cwd, p[0]))).content : stdin;
    const n = Number(flags.n) || 10;
    const lines = text.split("\n");
    const slice = name === "head" ? lines.slice(0, n) : lines.slice(-n);
    return { cwd, stdout: slice.join("\n") };
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
    await vfs.moveNode(userId, resolve(cwd, p[0]), resolve(cwd, p[1]));
    return { cwd, stdout: "" };
  }
  if (name === "cp") {
    if (p.length < 2) return { cwd, stdout: "", stderr: "cp: src dest required" };
    await vfs.copyNode(userId, resolve(cwd, p[0]), resolve(cwd, p[1]));
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
    return { cwd, stdout: tree.map((n) => n.path).join("\n") };
  }
  if (name === "find") {
    const dest = resolve(cwd, p[1] ? p[0] : cwd);
    const q = p[1] || p[0] || "";
    const hits = await vfs.searchFiles(userId, q || "");
    return { cwd, stdout: hits.filter((h) => h.path.startsWith(dest)).map((h) => h.path).join("\n") };
  }
  if (name === "grep") {
    const q = p[0];
    if (!q) return { cwd, stdout: "", stderr: "grep: query required" };
    const hay = p[1] ? (await vfs.readFile(userId, resolve(cwd, p[1]))).content : stdin;
    const lines = hay.split("\n").filter((l) => l.toLowerCase().includes(q.toLowerCase()));
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
      stdout: (jobs as Array<{ status: string; title: string }>).map((j) => `${j.status}\t${j.title}`).join("\n"),
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
  if (name === "clear" || name === "history" || name === "alias") {
    return { cwd, stdout: "" };
  }
  if (!isBuiltin(name)) {
    return { cwd, stdout: "", stderr: `${name}: command not found. Try help.` };
  }
  return { cwd, stdout: "", stderr: `${name}: not implemented` };
}

export { fail };
