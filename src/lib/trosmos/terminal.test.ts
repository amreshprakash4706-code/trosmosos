import assert from "node:assert/strict";
import { test } from "node:test";
import { isBuiltin, parsePipeline, tokenize } from "./terminal.ts";

test("tokenize honors quotes, pipes, and redirects", () => {
  const tokens = tokenize(`echo "hello world" | cat > out.txt`);
  assert.deepEqual(
    tokens.map((t) => t.type),
    ["word", "word", "pipe", "word", "gt", "word"],
  );
  assert.equal(tokens[1].value, "hello world");
});

test("parsePipeline extracts flags and positionals", () => {
  const pipe = parsePipeline(`ls -l --sort=name /Home`);
  assert.equal(pipe.commands.length, 1);
  const cmd = pipe.commands[0];
  assert.equal(cmd.name, "ls");
  assert.equal(cmd.flags.l, true);
  assert.equal(cmd.flags.sort, "name");
  assert.deepEqual(cmd.positionals, ["/Home"]);
});

test("parsePipeline handles append redirect", () => {
  const pipe = parsePipeline(`echo hi >> /Home/log.txt`);
  assert.equal(pipe.commands[0].redirect?.mode, "append");
  assert.equal(pipe.commands[0].redirect?.path, "/Home/log.txt");
});

test("builtins", () => {
  assert.equal(isBuiltin("ls"), true);
  assert.equal(isBuiltin("rm"), true);
  assert.equal(isBuiltin("zip"), true);
  assert.equal(isBuiltin("unzip"), true);
  assert.equal(isBuiltin("sudo"), false);
});
