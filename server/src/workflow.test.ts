import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { diffStat } from "./git.js";
import { Store } from "./store.js";
import { Workflow } from "./workflow.js";

let repo: string;
let wf: Workflow;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "wf-test-repo-"));
  writeFileSync(join(repo, "a.ts"), "export const a = 1;\n");
  execSync("git init -q && git add . && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: repo });
  wf = new Workflow();
  // Skip start(): no HTTP server or browser in unit tests.
  wf.store = new Store({ title: "T", task: "t", repos: [{ path: repo, name: "api", role: "change" }] }, []);
});

describe("Workflow", () => {
  it("shows a file's diff against HEAD and waits for approval", async () => {
    wf.beginFile("api", "a.ts", "s1", "bump a", "Service");
    writeFileSync(join(repo, "a.ts"), "export const a = 2;\n");
    const waiting = wf.fileReady("api", "a.ts");

    const file = wf.store!.state.files[0];
    expect(file).toMatchObject({ status: "awaiting_approval", layer: "Service", planRef: "s1", revision: 1 });
    expect(file.before).toBe("export const a = 1;\n");
    expect(file.after).toBe("export const a = 2;\n");

    wf.handleEvent({ type: "file_approved", repo: "api", path: "a.ts" });
    expect(await waiting).toEqual([{ type: "file_approved", repo: "api", path: "a.ts" }]);
    expect(wf.store!.state.files[0].status).toBe("approved");
  });

  it("treats new files as empty at HEAD", async () => {
    writeFileSync(join(repo, "b.ts"), "new\n");
    void wf.fileReady("api", "b.ts");
    expect(wf.store!.state.files[0]).toMatchObject({ before: "", after: "new\n" });
  });

  it("numbers findings and snapshots the fix diff", async () => {
    void wf.review([
      { severity: "high", category: "bug", repo: "api", path: "a.ts", line: 1, title: "wrong value", body: "" },
      { severity: "low", category: "style", repo: "api", path: "a.ts", line: 1, title: "naming", body: "" },
    ]);
    expect(wf.store!.state.findings.map((f) => [f.id, f.status])).toEqual([
      [1, "open"],
      [2, "open"],
    ]);

    wf.handleEvent({ type: "finding_fix", id: 1 });
    writeFileSync(join(repo, "a.ts"), "export const a = 3;\n");
    void wf.fixReady(1);
    expect(wf.store!.state.findings[0].fix).toEqual({ before: "export const a = 1;\n", after: "export const a = 3;\n", ready: true });
  });

  it("rejects unknown repos with the list of known ones", () => {
    expect(() => wf.fileReady("web", "x.ts")).toThrow(/Known: api/);
  });

  it("counts added lines in untracked files without touching the index", () => {
    writeFileSync(join(repo, "a.ts"), "export const a = 2;\nexport const b = 3;\n");
    writeFileSync(join(repo, "c.ts"), "one\ntwo\n");
    expect(diffStat(repo)).toEqual({ files: 2, added: 2 + 3, removed: 1 });
    expect(execSync("git diff --cached --name-only", { cwd: repo, encoding: "utf8" })).toBe("");
  });
});
