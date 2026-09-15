/** Trosmos shell parser — isomorphic. Execution happens on the server. */

export type ShellToken = { type: "word" | "pipe" | "gt" | "gtgt"; value: string };

export type ShellCommand = {
  name: string;
  args: string[];
  flags: Record<string, string | boolean>;
  positionals: string[];
  redirect?: { mode: "write" | "append"; path: string };
};

export type Pipeline = {
  commands: ShellCommand[];
  raw: string;
};

const BUILTINS = [
  "help",
  "clear",
  "history",
  "alias",
  "echo",
  "pwd",
  "cd",
  "ls",
  "cat",
  "touch",
  "mkdir",
  "rm",
  "mv",
  "cp",
  "find",
  "grep",
  "head",
  "tail",
  "stat",
  "tree",
  "whoami",
  "date",
  "uname",
  "df",
  "du",
  "open",
  "apps",
  "notes",
  "tasks",
  "search",
  "jobs",
  "notify",
  "settings",
  "export",
  "ai",
  "version",
  "man",
];

export const HELP: Record<string, string> = {
  help: "help [command] — list commands or explain one",
  ls: "ls [path] [-l] — list a directory",
  cd: "cd [path] — change working directory",
  pwd: "pwd — print working directory",
  cat: "cat <path> — print a text file",
  touch: "touch <name> — create an empty file here",
  mkdir: "mkdir <name> — create a folder",
  rm: "rm <path> — move to Trash (use rm --permanent for delete)",
  mv: "mv <src> <destDir> — move",
  cp: "cp <src> <destDir> — copy",
  find: "find [path] [query] — search names under a path",
  grep: "grep <query> [path] — search file contents",
  open: "open <app|path> — launch an app or open a file",
  notes: "notes [list|new <title>] — notes",
  tasks: "tasks [list|add <title>] — tasks",
  search: "search <query> — unified search",
  jobs: "jobs [list] — background jobs",
  whoami: "whoami — current account",
  uname: "uname — Trosmos version",
  df: "df — storage usage",
  echo: "echo <text> — print text; use > file to write",
  ai: "ai <prompt> — ask Trosmos AI (online)",
  clear: "clear — clear the terminal view",
  history: "history — local command history",
  version: "version — Trosmos OS version",
};

export function tokenize(input: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let cur = "";
  let quote: string | null = null;
  const flush = () => {
    if (cur.length) {
      tokens.push({ type: "word", value: cur });
      cur = "";
    }
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "\\") {
      cur += input[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (ch === "|") {
      flush();
      tokens.push({ type: "pipe", value: "|" });
      continue;
    }
    if (ch === ">" && input[i + 1] === ">") {
      flush();
      tokens.push({ type: "gtgt", value: ">>" });
      i += 1;
      continue;
    }
    if (ch === ">") {
      flush();
      tokens.push({ type: "gt", value: ">" });
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    cur += ch;
  }
  flush();
  return tokens;
}

function parseCommand(tokens: ShellToken[]): ShellCommand {
  const words: string[] = [];
  let redirect: ShellCommand["redirect"];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "gt" || t.type === "gtgt") {
      const next = tokens[i + 1];
      if (next?.type === "word") {
        redirect = { mode: t.type === "gtgt" ? "append" : "write", path: next.value };
        i += 1;
      }
      continue;
    }
    if (t.type === "word") words.push(t.value);
  }
  const name = (words[0] || "").toLowerCase();
  const args = words.slice(1);
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--") && a.includes("=")) {
      const [k, v] = a.slice(2).split("=");
      flags[k] = v;
    } else if (a.startsWith("--")) {
      flags[a.slice(2)] = true;
    } else if (a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)) {
      for (const ch of a.slice(1)) flags[ch] = true;
    } else {
      positionals.push(a);
    }
  }
  return { name, args, flags, positionals, redirect };
}

export function parsePipeline(input: string): Pipeline {
  const raw = input.trim();
  const tokens = tokenize(raw);
  const groups: ShellToken[][] = [[]];
  for (const t of tokens) {
    if (t.type === "pipe") groups.push([]);
    else groups[groups.length - 1].push(t);
  }
  return { commands: groups.filter((g) => g.length).map(parseCommand), raw };
}

export function isBuiltin(name: string): boolean {
  return BUILTINS.includes(name);
}

export { BUILTINS };
