import assert from "node:assert/strict";
import { test } from "node:test";
import { pickConflictName, preserveExtension } from "./conflict.ts";
import { escapeHtml, findMatches, highlight, langFromName, replaceMatches } from "./highlight.ts";
import { nextOccurrence, parseRecurrence, serializeRecurrence, expandOccurrences, isOverdue } from "./recurrence.ts";
import { eventMatches, matchShortcut, parseChord } from "./shortcuts.ts";
import { extractWikiLinks, markdownExport, replaceWikiLink, backlinksTo } from "./wiki.ts";
import { decodeZip, encodeZip } from "./zip.ts";
import { rankHit, uniqueCandidate } from "./core.ts";
import { isBuiltin } from "./terminal.ts";

test("conflict rename preserves uniqueness", () => {
  const taken = new Set(["a.md", "a (1).md"]);
  assert.equal(pickConflictName("b.md", taken, "rename"), "b.md");
  assert.equal(pickConflictName("a.md", taken, "skip"), null);
  assert.equal(pickConflictName("a.md", taken, "overwrite"), "a.md");
  assert.equal(pickConflictName("a.md", taken, "rename"), "a (2).md");
  assert.equal(preserveExtension("note.md", "note copy"), "note copy.md");
});

test("recurrence next occurrence", () => {
  const d = new Date("2026-01-01T12:00:00.000Z");
  const daily = parseRecurrence("daily");
  assert.ok(daily);
  const n = nextOccurrence(d, daily!);
  assert.equal(n.toISOString(), "2026-01-02T12:00:00.000Z");
  assert.equal(serializeRecurrence({ freq: "weekly", interval: 2 }), "weekly:2");
  const occ = expandOccurrences(d, daily!, new Date("2026-01-02T00:00:00Z"), new Date("2026-01-04T00:00:00Z"));
  assert.ok(occ.length >= 2);
  assert.equal(isOverdue("2000-01-01T00:00:00Z", "todo"), true);
  assert.equal(isOverdue("2000-01-01T00:00:00Z", "done"), false);
});

test("wiki links extract and replace", () => {
  const links = extractWikiLinks("See [[Home]] and [[Home]] and [[Tasks]]");
  assert.deepEqual(links, ["Home", "Tasks"]);
  assert.equal(replaceWikiLink("[[Home]]", "Home", "Index"), "[[Index]]");
  const notes = [
    { id: "1", title: "Home", content: "x" },
    { id: "2", title: "Other", content: "link [[Home]]" },
  ];
  assert.equal(backlinksTo(notes, notes[0]).length, 1);
  assert.ok(markdownExport("T", "body", ["a"]).includes("title: T"));
});

test("highlight escapes html", () => {
  assert.equal(escapeHtml("<script>"), "\u0026lt;script\u0026gt;");
  assert.equal(escapeHtml("a&b"), "a\u0026amp;b");
  assert.equal(langFromName("a.ts"), "typescript");
  const html = highlight("const x = 1;", "javascript");
  assert.ok(html.includes("tok-kw"));
  assert.ok(!html.includes("<script>"));
  assert.deepEqual(findMatches("abc abc", "abc"), [0, 4]);
  assert.equal(replaceMatches("abc abc", "abc", "z", { all: true }).count, 2);
});

test("zip roundtrip and traversal skip", () => {
  const bytes = encodeZip([
    { path: "a/hello.txt", data: "hello" },
    { path: "a/dir", data: new Uint8Array(0), isDir: true },
  ]);
  const { entries } = decodeZip(bytes, "/Home/Downloads");
  assert.ok(entries.some((e) => e.path.endsWith("hello.txt")));
  const sneaky = encodeZip([{ path: "../etc/passwd", data: "x" }]);
  const out = decodeZip(sneaky, "/Home/Downloads");
  assert.ok(out.skipped.length || out.entries.every((e) => e.path.startsWith("/Home/Downloads")));
});

test("shortcuts and ranking", () => {
  const chord = parseChord("Mod+K");
  assert.equal(chord.mod, true);
  assert.equal(chord.key, "k");
  assert.ok(
    eventMatches({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, key: "k" }, chord),
  );
  assert.equal(matchShortcut({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, key: "k" })?.id, "palette");
  assert.ok(rankHit("files", { title: "Files", kind: "app" }) > 0);
  assert.equal(uniqueCandidate("a.md", new Set(["a.md"])), "a (1).md");
  assert.equal(isBuiltin("unalias"), true);
  assert.equal(isBuiltin("zip"), true);
  assert.equal(isBuiltin("unzip"), true);
});
