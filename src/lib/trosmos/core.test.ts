import assert from "node:assert/strict";
import { test } from "node:test";
import {
  basename,
  fuzzyIncludes,
  isDescendantPath,
  isSystemPath,
  isTextMime,
  joinPath,
  mimeFromName,
  normalizePath,
  parentPath,
  parseTags,
  safeName,
  scoreMatch,
  uniqueCandidate,
} from "./core.ts";

test("normalizePath collapses dots and slashes", () => {
  assert.equal(normalizePath("/Home/../Home/Documents/./a"), "/Home/Documents/a");
  assert.equal(normalizePath("Home/Notes"), "/Home/Notes");
  assert.equal(normalizePath("/Home/../../etc"), "/etc");
  assert.equal(normalizePath(".."), "/");
});

test("parentPath and joinPath", () => {
  assert.equal(parentPath("/Home/Documents/Welcome.md"), "/Home/Documents");
  assert.equal(parentPath("/Home"), "/");
  assert.equal(parentPath("/"), null);
  assert.equal(joinPath("/Home", "Documents", "a.md"), "/Home/Documents/a.md");
  assert.equal(basename("/Home/a.md"), "a.md");
});

test("safeName strips reserved characters", () => {
  assert.equal(safeName('bad:name/*.txt'), "badname.txt");
  assert.equal(safeName("...hidden"), "hidden");
  assert.equal(safeName(""), "untitled");
});

test("system and descendant paths", () => {
  assert.equal(isSystemPath("/Trash"), true);
  assert.equal(isSystemPath("/Home/Documents"), false);
  assert.equal(isDescendantPath("/Home", "/Home/Documents/a"), true);
  assert.equal(isDescendantPath("/Home/Documents", "/Home"), false);
});

test("mime and text detection", () => {
  assert.equal(mimeFromName("note.md"), "text/markdown");
  assert.equal(isTextMime("application/json", "x.json"), true);
  assert.equal(isTextMime("image/png", "x.png"), false);
});

test("uniqueCandidate and ranking", () => {
  assert.equal(uniqueCandidate("a.md", new Set(["a.md"])), "a (1).md");
  assert.ok(scoreMatch("welcome", "Welcome.md") > scoreMatch("welcome", "other"));
  assert.equal(fuzzyIncludes("trosmos", "tms"), true);
  assert.deepEqual(parseTags('["work","os"]'), ["work", "os"]);
});
