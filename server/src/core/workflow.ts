import { randomUUID } from "node:crypto";
import {
  isUnresolved,
  type Answer,
  type FileEntry,
  type Finding,
  type History,
  type Phase,
  type Plan,
  type Outcome,
  type Question,
  type RepoRef,
  type TaskContext,
  type UserEvent,
  type WorkflowState,
} from "../../../shared/protocol.js";
import { startCockpitServer } from "../http/server.js";
import { openInBrowser } from "../services/browser.js";
import { diffStat, readAtHead, readWorking } from "../services/git.js";
import { loadMemory, rememberContext, rememberReviewers } from "../services/memory.js";
import { clearRuntime, publishRuntime } from "../services/runtime.js";
import { Store } from "./store.js";

export type LoadingPhase = Extract<Phase, "research" | "planning" | "publishing">;
export type NewFinding = Omit<Finding, "id" | "status">;
export type ProposedHistory = Omit<History, "reviewers"> & { reviewers?: string[] };

export interface FileStart {
  repo: string;
  path: string;
  planRef?: string;
  intent?: string;
  layer?: string;
}

function findRepo(repos: RepoRef[], name: string): RepoRef {
  const repo = repos.find((r) => r.name === name || r.path === name);
  if (!repo) throw new Error(`Unknown repo "${name}". Known: ${repos.map((r) => r.name).join(", ")}`);
  return repo;
}

/**
 * Every operation Claude can perform on the cockpit. Methods that return a
 * promise wait for the user; the others return pending events immediately.
 * The MCP tools and the demo both drive this class.
 */
export interface WorkflowHooks {
  /** The user acted in the cockpit while Claude wasn't waiting for them. */
  onUserActsWhileClaudeIdle?: () => void;
}

export class Workflow {
  store: Store | null = null;
  url: string | null = null;

  constructor(private hooks: WorkflowHooks = {}) {}

  private get run(): Store {
    if (!this.store) throw new Error("No workflow running. Call workflow_start first.");
    return this.store;
  }

  async start(context: TaskContext, { openBrowser = true } = {}): Promise<string> {
    rememberContext(context);
    if (this.store) {
      // A second /workflow in the same session reuses the open cockpit, with a clean slate.
      this.store.reset(context, loadMemory().reviewers);
    } else {
      this.store = new Store(context, loadMemory().reviewers);
      this.store.onUserActsWhileClaudeIdle = this.hooks.onUserActsWhileClaudeIdle ?? null;
      this.url = await startCockpitServer(this);
      this.keepRuntimeEntryCurrent(this.store, this.url);
    }
    if (openBrowser) openInBrowser(this.url!);
    return this.url!;
  }

  /** Entry point for UI events, so file snapshots happen at the right moment. */
  handleEvent(event: UserEvent) {
    if (event.type === "finding_fix") {
      const finding = this.run.state.findings.find((f) => f.id === event.id);
      if (finding) finding.fix = { before: this.read(finding.repo, finding.path).working, after: "", ready: false };
    }
    if (event.type === "publish") rememberReviewers(event.reviewers);
    this.run.push(event);
  }

  context() {
    return { ...this.run.state.context, events: this.run.drain() };
  }

  unresolvedFindingIds(): number[] {
    return this.run.state.findings.filter(isUnresolved).map((f) => f.id);
  }

  status(message: string, phase?: LoadingPhase) {
    this.run.update((s) => {
      if (phase) s.phase = phase;
      s.status.message = message;
      s.status.log.push(message);
    });
    return this.run.drain();
  }

  /** Questions with an id already on screen replace the old version. */
  ask(questions: Question[]) {
    const ids = new Set(questions.map((q) => q.id));
    this.run.update((s) => {
      s.phase = "validation";
      s.questions = [...s.questions.filter((q) => !ids.has(q.id)), ...questions];
    });
    return this.run.waitForUser();
  }

  presentPlan(plan: Plan) {
    this.run.update((s) => {
      s.phase = "plan";
      s.plan = plan;
    });
    return this.run.waitForUser();
  }

  beginFile({ repo, path, planRef, intent, layer }: FileStart) {
    this.run.update((s) => {
      s.phase = "coding";
      const file = this.fileEntry(s, repo, path, "writing");
      file.status = "writing";
      file.planRef = planRef ?? file.planRef;
      file.intent = intent ?? file.intent;
      file.layer = layer ?? file.layer;
    });
    return this.run.drain();
  }

  /** Shows the file's diff against HEAD; the UI replays it and waits for approval. */
  fileReady(repo: string, path: string) {
    const { head, working } = this.read(repo, path);
    this.run.update((s) => {
      s.phase = "coding";
      const file = this.fileEntry(s, repo, path, "writing");
      file.before = head;
      file.after = working;
      file.status = "awaiting_approval";
      file.revision += 1;
    });
    return this.run.waitForUser();
  }

  codeReady(markdown: string) {
    this.run.update((s) => {
      s.phase = "code_ready";
      const changed = s.context.repos.filter((r) => r.role === "change");
      s.summary = { markdown, stats: changed.map((r) => ({ repo: r.name, ...diffStat(r.path) })) };
    });
    return this.run.waitForUser();
  }

  review(findings: NewFinding[]) {
    this.run.update((s) => {
      s.phase = "review";
      let nextId = Math.max(0, ...s.findings.map((f) => f.id)) + 1;
      for (const finding of findings) {
        this.refreshFile(s, finding.repo, finding.path);
        s.findings.push({ ...finding, id: nextId++, status: "open" });
      }
    });
    return this.run.waitForUser();
  }

  /** Shows the fix for a finding (what changed since Fix was pressed) and waits. */
  fixReady(id: number) {
    this.run.update((s) => {
      const finding = s.findings.find((f) => f.id === id);
      if (!finding) throw new Error(`No finding #${id}`);
      const { head, working } = this.read(finding.repo, finding.path);
      finding.fix = { before: finding.fix?.before ?? head, after: working, ready: true };
      finding.status = "fixing";
      this.refreshFile(s, finding.repo, finding.path);
    });
    return this.run.waitForUser();
  }

  proposeHistory(history: ProposedHistory) {
    this.run.update((s) => {
      s.phase = "history";
      s.history = { ...history, reviewers: history.reviewers ?? s.history?.reviewers ?? [] };
    });
    return this.run.waitForUser();
  }

  published(outcome: Outcome) {
    this.run.update((s) => {
      s.phase = "published";
      s.outcome = outcome;
    });
  }

  reply(text: string, about?: string, setAnswers?: Record<string, Answer>) {
    this.run.update((s) => {
      s.chat.push({ id: randomUUID(), from: "claude", text, about, at: Date.now() });
      if (setAnswers) s.answers = { ...s.answers, ...setAnswers };
    });
    return this.run.drain();
  }

  wait() {
    return this.run.waitForUser();
  }

  /** A repo of the current task, by the name Claude gave it. */
  repo(name: string): RepoRef {
    return findRepo(this.run.state.context.repos, name);
  }

  /** The user saved a file in the cockpit editor: refresh its diff and tell Claude. */
  recordUserEdit(repo: string, path: string) {
    this.run.update((s) => {
      const file = s.files.find((f) => f.repo === repo && f.path === path);
      if (file) file.after = this.read(repo, path).working;
    });
    this.run.push({ type: "file_edited", repo, path });
  }

  /** Closes the workflow so Claude may end its turn (the cockpit shows it ended). */
  end() {
    this.run.update((s) => {
      s.phase = "ended";
    });
  }

  /** Lets the Stop hook see whether this session still has a workflow open. */
  private keepRuntimeEntryCurrent(store: Store, url: string) {
    let lastPhase: string | null = null;
    store.subscribe((state) => {
      if (state.phase === lastPhase) return;
      lastPhase = state.phase;
      publishRuntime({ url, phase: state.phase });
    });
    process.once("exit", clearRuntime);
  }

  private read(repoName: string, path: string) {
    const repo = findRepo(this.run.state.context.repos, repoName);
    return { head: readAtHead(repo.path, path), working: readWorking(repo.path, path) };
  }

  private fileEntry(s: WorkflowState, repo: string, path: string, status: FileEntry["status"]): FileEntry {
    let file = s.files.find((f) => f.repo === repo && f.path === path);
    if (!file) {
      file = { repo, path, status, revision: 0 };
      s.files.push(file);
    }
    return file;
  }

  /** Keeps the review screen's copy of a file current. */
  private refreshFile(s: WorkflowState, repo: string, path: string) {
    const { head, working } = this.read(repo, path);
    const file = this.fileEntry(s, repo, path, "approved");
    file.before = head;
    file.after = working;
  }
}
