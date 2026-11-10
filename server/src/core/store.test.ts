import { describe, expect, it } from "vitest";
import type { Finding, TaskContext } from "../../../shared/protocol.js";
import { Store } from "./store.js";

const ctx: TaskContext = { title: "T", task: "do it", repos: [{ path: "/tmp/x", name: "api", role: "change" }] };

const finding = (id: number, status: Finding["status"] = "open"): Finding => ({
  id,
  status,
  severity: "high",
  category: "bug",
  repo: "api",
  path: "a.ts",
  line: 1,
  title: `f${id}`,
  body: "",
});

describe("Store", () => {
  it("hands queued events to the next wait without blocking", async () => {
    const s = new Store(ctx, []);
    s.push({ type: "plan_approved" });
    expect(await s.waitForUser()).toEqual([{ type: "plan_approved" }]);
  });

  it("wakes a waiting tool when the user acts", async () => {
    const s = new Store(ctx, []);
    const waiting = s.waitForUser();
    expect(s.state.claudeWaiting).toBe(true);
    s.push({ type: "chat", text: "why redis?", via: "voice", about: "slide:s3" });
    expect(await waiting).toHaveLength(1);
    expect(s.state.claudeWaiting).toBe(false);
    expect(s.state.chat[0]).toMatchObject({ from: "user", text: "why redis?", via: "voice", about: "slide:s3" });
  });

  it("returns no events when the wait times out", async () => {
    const s = new Store(ctx, []);
    expect(await s.waitForUser()).toEqual([]);
  });

  it("only wakes Claude on dismiss when it clears the last open finding", async () => {
    const s = new Store(ctx, []);
    s.state.findings = [finding(1), finding(2)];

    const waiting = s.waitForUser();
    s.push({ type: "finding_dismiss", id: 1 });
    // Still asleep: #2 is open.
    expect(s.state.claudeWaiting).toBe(true);
    s.push({ type: "finding_dismiss", id: 2 });
    expect(await waiting).toEqual([
      { type: "finding_dismiss", id: 1 },
      { type: "finding_dismiss", id: 2 },
    ]);
    expect(s.state.findings.map((f) => f.status)).toEqual(["dismissed", "dismissed"]);
  });

  it("keeps PR edits from the pencil without waking Claude, and publishes them", async () => {
    const s = new Store(ctx, []);
    const pr = { id: "p1", repo: "api", branch: "b", base: "main", title: "Old", body: "", commits: [] };
    s.state.history = { prs: [pr], reviewers: [] };

    const waiting = s.waitForUser();
    s.push({ type: "history_edited", prs: [{ ...pr, title: "New" }] });
    expect(s.state.claudeWaiting).toBe(true);
    expect(s.state.history.prs[0].title).toBe("New");

    s.push({ type: "publish", reviewers: ["octocat"], prs: [{ ...pr, title: "Final" }] });
    const events = await waiting;
    expect(events.map((e) => e.type)).toEqual(["history_edited", "publish"]);
    expect(s.state.history).toMatchObject({ reviewers: ["octocat"], prs: [{ title: "Final" }] });
  });

  it("marks a rejected fix as no longer ready", () => {
    const s = new Store(ctx, []);
    s.state.findings = [{ ...finding(1, "fixing"), fix: { before: "a", after: "b", ready: true } }];
    s.push({ type: "fix_rejected", id: 1, text: "use a constant" });
    expect(s.state.findings[0].fix?.ready).toBe(false);
  });
});

describe("Store.reset", () => {
  it("starts a new run with nothing carried over from the previous one", async () => {
    const s = new Store(ctx, []);
    const firstId = s.state.id;
    s.state.questions = [{ id: "q1", stage: "product", title: "Old?", context: "", options: [] }];
    s.push({ type: "answers", answers: { q1: { optionId: "a" } } });
    s.push({ type: "chat", text: "old message", via: "text" });

    const seen: string[] = [];
    s.subscribe((state) => seen.push(state.id));
    s.reset({ ...ctx, title: "Second task" }, ["octocat"]);

    expect(s.state.id).not.toBe(firstId);
    expect(s.state).toMatchObject({ phase: "research", questions: [], answers: {}, chat: [], files: [], findings: [], outcome: null });
    expect(s.state.context.title).toBe("Second task");
    expect(s.drain()).toEqual([]); // the old run's queued events are gone
    expect(seen.at(-1)).toBe(s.state.id); // the UI hears about the new run
  });
});

describe("Store v0.3 review flow", () => {
  it("enters the reviewing step as soon as the user starts the pre-review", () => {
    const s = new Store(ctx, []);
    s.state.phase = "code_ready";
    s.push({ type: "start_review" });
    expect(s.state.phase).toBe("reviewing");
  });

  it("marks a finding fixed when the user fixed it by hand, waking Claude only when that clears the review", async () => {
    const s = new Store(ctx, []);
    s.state.findings = [finding(1), finding(2)];
    const waiting = s.waitForUser();
    s.push({ type: "finding_fixed_manually", id: 1 });
    expect(s.state.findings[0].status).toBe("fixed");
    expect(s.state.claudeWaiting).toBe(true); // #2 still open
    s.push({ type: "finding_dismiss", id: 2 });
    expect((await waiting).map((e) => e.type)).toEqual(["finding_fixed_manually", "finding_dismiss"]);
  });

  it("remembers how the user chose to finish", () => {
    const s = new Store(ctx, []);
    s.state.history = { prs: [], reviewers: [] };
    s.push({ type: "publish", mode: "local", reviewers: [], prs: [] });
    expect(s.state.publishMode).toBe("local");
  });
});
