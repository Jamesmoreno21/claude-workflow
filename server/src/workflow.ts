import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type {
  Answer,
  Finding,
  History,
  Phase,
  Plan,
  PublishedLink,
  Question,
  TaskContext,
  UserEvent,
  WorkflowState,
} from "../../shared/protocol.js";
import { diffStat, readAtHead, readWorking, resolveRepo } from "./git.js";
import { startUi } from "./http.js";
import { loadMemory, rememberContext, rememberReviewers } from "./memory.js";
import { Store } from "./store.js";

/**
 * Every operation Claude can perform on the cockpit. The MCP layer is a thin
 * wrapper around this class, and the demo script drives it directly.
 */
export class Workflow {
  store: Store | null = null;
  url: string | null = null;

  private get s(): Store {
    if (!this.store) throw new Error("No workflow running. Call workflow_start first.");
    return this.store;
  }

  async start(context: TaskContext, { openBrowser = true } = {}) {
    rememberContext(context);
    if (this.store) {
      // Restarting inside the same session reuses the open tab.
      this.store.update((s) => {
        s.context = context;
        s.phase = "research";
      });
    } else {
      this.store = new Store(context, loadMemory().reviewers);
      this.url = await startUi(this);
    }
    if (openBrowser) execFile(process.platform === "darwin" ? "open" : "xdg-open", [this.url!]);
    return this.url!;
  }

  /** UI events pass through here so file snapshots happen at the right moment. */
  handleEvent(e: UserEvent) {
    if (e.type === "finding_fix") {
      const f = this.s.state.findings.find((f) => f.id === e.id);
      if (f) {
        const repo = resolveRepo(this.s.state.context.repos, f.repo);
        f.fix = { before: readWorking(repo.path, f.path), after: "", ready: false };
      }
    }
    if (e.type === "publish") rememberReviewers(e.reviewers);
    this.s.push(e);
  }

  context() {
    return { ...this.s.state.context, events: this.s.drain() };
  }

  status(message: string, phase?: Extract<Phase, "research" | "planning" | "publishing">) {
    this.s.update((s) => {
      if (phase) s.phase = phase;
      s.status.message = message;
      s.status.log.push(message);
    });
    return this.s.drain();
  }

  ask(questions: Question[]) {
    this.s.update((s) => {
      s.phase = "validation";
      const ids = new Set(questions.map((q) => q.id));
      s.questions = [...s.questions.filter((q) => !ids.has(q.id)), ...questions];
    });
    return this.s.waitForUser();
  }

  presentPlan(plan: Plan) {
    this.s.update((s) => {
      s.phase = "plan";
      s.plan = plan;
    });
    return this.s.waitForUser();
  }

  beginFile(repoName: string, path: string, planRef?: string, intent?: string, layer?: string) {
    this.s.update((s) => {
      s.phase = "coding";
      const existing = s.files.find((f) => f.repo === repoName && f.path === path);
      if (existing)
        Object.assign(existing, {
          status: "writing",
          planRef: planRef ?? existing.planRef,
          intent: intent ?? existing.intent,
          layer: layer ?? existing.layer,
        });
      else s.files.push({ repo: repoName, path, planRef, intent, layer, status: "writing", revision: 0 });
    });
    return this.s.drain();
  }

  fileReady(repoName: string, path: string) {
    const repo = resolveRepo(this.s.state.context.repos, repoName);
    this.s.update((s) => {
      let f = s.files.find((f) => f.repo === repoName && f.path === path);
      if (!f) {
        f = { repo: repoName, path, status: "writing", revision: 0 };
        s.files.push(f);
      }
      f.before = readAtHead(repo.path, path);
      f.after = readWorking(repo.path, path);
      f.status = "awaiting_approval";
      f.revision += 1;
      s.phase = "coding";
    });
    return this.s.waitForUser();
  }

  codeReady(markdown: string) {
    this.s.update((s) => {
      s.phase = "code_ready";
      s.summary = {
        markdown,
        stats: s.context.repos.filter((r) => r.role === "change").map((r) => ({ repo: r.name, ...diffStat(r.path) })),
      };
    });
    return this.s.waitForUser();
  }

  /** Make sure the review screen has the current contents of a file. */
  private snapshot(s: WorkflowState, repoName: string, path: string) {
    const repo = resolveRepo(s.context.repos, repoName);
    let f = s.files.find((f) => f.repo === repoName && f.path === path);
    if (!f) {
      f = { repo: repoName, path, status: "approved", revision: 0 };
      s.files.push(f);
    }
    f.before = readAtHead(repo.path, path);
    f.after = readWorking(repo.path, path);
  }

  review(findings: Omit<Finding, "id" | "status">[]) {
    this.s.update((s) => {
      s.phase = "review";
      let next = Math.max(0, ...s.findings.map((f) => f.id)) + 1;
      for (const f of findings) {
        this.snapshot(s, f.repo, f.path);
        s.findings.push({ ...f, id: next++, status: "open" });
      }
    });
    return this.s.waitForUser();
  }

  fixReady(id: number) {
    this.s.update((s) => {
      const f = s.findings.find((f) => f.id === id);
      if (!f) throw new Error(`No finding #${id}`);
      const repo = resolveRepo(s.context.repos, f.repo);
      const after = readWorking(repo.path, f.path);
      f.fix = { before: f.fix?.before ?? readAtHead(repo.path, f.path), after, ready: true };
      f.status = "fixing";
      this.snapshot(s, f.repo, f.path);
    });
    return this.s.waitForUser();
  }

  proposeHistory(history: Omit<History, "reviewers"> & { reviewers?: string[] }) {
    this.s.update((s) => {
      s.phase = "history";
      s.history = { ...history, reviewers: history.reviewers ?? s.history?.reviewers ?? [] };
    });
    return this.s.waitForUser();
  }

  published(links: PublishedLink[]) {
    this.s.update((s) => {
      s.phase = "published";
      s.published = links;
    });
  }

  reply(text: string, about?: string, setAnswers?: Record<string, Answer>) {
    this.s.update((s) => {
      s.chat.push({ id: randomUUID(), from: "claude", text, about, at: Date.now() });
      if (setAnswers) s.answers = { ...s.answers, ...setAnswers };
    });
    return this.s.drain();
  }

  wait() {
    return this.s.waitForUser();
  }
}
