import assert from "node:assert/strict";
import test from "node:test";
import { MemoryCard } from "../src/core/index";
import type { CardEntry } from "../src/core/index";
import {
  FolderDumpError,
  planDump,
  safeSegment,
  writeDump,
} from "../src/browser/files";
import type { DumpDirectory, DumpFileHandle } from "../src/browser/files";
import { fixture } from "./helpers";
const notFound = () =>
  Object.assign(new Error("Missing"), { name: "NotFoundError" });
class Directory implements DumpDirectory {
  dirs = new Map<string, Directory>();
  files = new Map<string, Uint8Array>();
  failAfter = Infinity;
  completed = 0;
  aborts = 0;
  constructor(readonly owner?: Directory) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    if (this.files.has(name)) throw new Error("File exists");
    if (!this.dirs.has(name)) {
      if (!options?.create) throw notFound();
      this.dirs.set(name, new Directory(this.owner ?? this));
    }
    return this.dirs.get(name)!;
  }
  async getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<DumpFileHandle> {
    if (this.dirs.has(name)) throw new Error("Directory exists");
    if (!this.files.has(name)) {
      if (!options?.create) throw notFound();
      this.files.set(name, new Uint8Array());
    }
    const owner = this.owner ?? this;
    return {
      createWritable: async () => ({
        write: async (bytes) => {
          if (owner.completed >= owner.failAfter)
            throw new Error("Permission lost");
          this.files.set(name, bytes.slice());
        },
        close: async () => {
          owner.completed++;
        },
        abort: async () => {
          owner.aborts++;
        },
      }),
    };
  }
}
test("folder dump preserves exact file bytes, nested names and empty files", async () => {
  const card = new MemoryCard(fixture()),
    plan = planDump(card, card.entries[0]!);
  const dir = new Directory();
  assert.equal(await writeDump(dir, plan), plan.files.length);
  for (const file of plan.files) {
    let child = dir.dirs.get(plan.name)!;
    for (const part of file.parts.slice(0, -1)) child = child.dirs.get(part)!;
    assert.deepEqual(child.files.get(file.parts.at(-1)!), file.bytes);
  }
  assert.equal(dir.dirs.get("SAVE-A")!.files.get("bytes-0")!.length, 0);
});
test("existing output folder is rejected before any file write", async () => {
  const card = new MemoryCard(fixture()),
    plan = planDump(card, card.entries[0]!);
  const dir = new Directory();
  dir.dirs.set(plan.name, new Directory());
  await assert.rejects(
    writeDump(dir, plan),
    (error: unknown) =>
      error instanceof FolderDumpError &&
      error.completed === 0 &&
      !error.started,
  );
  assert.equal(dir.completed, 0);
});
test("partial writes are counted and failed streams are aborted", async () => {
  const card = new MemoryCard(fixture()),
    plan = planDump(card, card.entries[0]!);
  const dir = new Directory();
  dir.failAfter = 2;
  await assert.rejects(
    writeDump(dir, plan),
    (error: unknown) =>
      error instanceof FolderDumpError &&
      error.completed === 2 &&
      error.started &&
      /partial files/.test(error.message),
  );
  assert.equal(dir.aborts, 1);
});
test("unsafe names and case-folded collisions fail before folder creation", () => {
  for (const name of [
    "",
    ".",
    "..",
    "../bad",
    "bad\\file",
    "a:b",
    "NUL",
    "con.txt",
    "bad.",
    "bad ",
    "bad\0name",
  ])
    assert.throws(() => safeSegment(name));
  safeSegment("BASLUS-21274");
  const card = new MemoryCard(fixture()),
    root = card.entries[0]!;
  const children = [
    { ...root.children[0]!, name: "Foo" },
    { ...root.children[0]!, name: "foo" },
  ];
  assert.throws(
    () => planDump(card, { ...root, children } as CardEntry),
    /collide/,
  );
});
