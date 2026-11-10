import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { fileContents, inspectRepo, repoTree, SaveConflictError, saveFile } from "./git.js";

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "wf-editor-"));
  mkdirSync(join(repo, "src"));
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, ".gitignore"), "secret.env\n");
  execSync("git init -q && git add . && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: repo });
});

describe("inspectRepo", () => {
  it("resolves a folder inside a repo to the repo root", async () => {
    expect(await inspectRepo(join(repo, "src"))).toEqual({
      ok: true,
      path: execSync("git rev-parse --show-toplevel", { cwd: repo, encoding: "utf8" }).trim(),
      name: expect.any(String),
    });
  });

  it("explains paths that aren't usable", async () => {
    expect(await inspectRepo(join(repo, "missing"))).toMatchObject({ ok: false, error: expect.stringMatching(/doesn't exist/) });
    expect(await inspectRepo(tmpdir())).toMatchObject({ ok: false, error: expect.stringMatching(/isn't a git repository/) });
  });
});

describe("repoTree", () => {
  it("lists tracked and new files, marks changes, and leaves ignored files out", async () => {
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 2;\n");
    writeFileSync(join(repo, "src", "b.ts"), "new\n");
    writeFileSync(join(repo, "secret.env"), "KEY=1\n");
    const tree = await repoTree(repo);
    expect(tree.files).toEqual([".gitignore", "src/a.ts", "src/b.ts"]);
    expect(tree.changed).toEqual({ "src/a.ts": "M", "src/b.ts": "?" });
  });
});

describe("fileContents and saveFile", () => {
  it("returns HEAD and working copies, and refuses binaries", async () => {
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 2;\n");
    expect(await fileContents(repo, "src/a.ts", true)).toEqual({
      head: "export const a = 1;\n",
      working: "export const a = 2;\n",
      binary: false,
      editable: true,
    });
    writeFileSync(join(repo, "logo.png"), Buffer.from([0x89, 0x50, 0x00, 0x01]));
    expect(await fileContents(repo, "logo.png", true)).toEqual({ binary: true });
  });

  it("saves an edit, but not over a change made since the file was opened", async () => {
    await saveFile(repo, "src/a.ts", "edited\n", "export const a = 1;\n");
    expect(readFileSync(join(repo, "src", "a.ts"), "utf8")).toBe("edited\n");
    await expect(saveFile(repo, "src/a.ts", "mine\n", "export const a = 1;\n")).rejects.toBeInstanceOf(SaveConflictError);
  });

  it("refuses paths outside the repo", async () => {
    await expect(saveFile(repo, "../escape.txt", "x", "")).rejects.toThrow(/outside/);
  });
});
