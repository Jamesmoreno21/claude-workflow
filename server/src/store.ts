import { randomUUID } from "node:crypto";
import type { TaskContext, UserEvent, WorkflowState } from "../../shared/protocol.js";
import { saveSession } from "./memory.js";

type Listener = (state: WorkflowState) => void;

/** How long a waiting tool blocks before handing control back to Claude. */
const WAIT_MS = Number(process.env.WORKFLOW_WAIT_MS ?? 8 * 60_000);

/**
 * Single source of truth for one workflow run. Claude mutates it through MCP
 * tools, the UI through events; every change is broadcast as a snapshot.
 */
export class Store {
  state: WorkflowState;
  private listeners = new Set<Listener>();
  private queue: UserEvent[] = [];
  private wake: (() => void) | null = null;

  constructor(context: TaskContext, reviewers: string[]) {
    this.state = {
      id: randomUUID().slice(0, 8),
      phase: "research",
      context,
      status: { message: "Reading the task and repositories…", log: [] },
      questions: [],
      answers: {},
      plan: null,
      files: [],
      summary: null,
      findings: [],
      history: null,
      published: [],
      chat: [],
      claudeWaiting: false,
      memory: { reviewers },
    };
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  update(fn: (s: WorkflowState) => void) {
    fn(this.state);
    for (const l of this.listeners) l(this.state);
    saveSession(this.state);
  }

  /** Called for every event coming from the UI. */
  push(event: UserEvent) {
    let wakesClaude = true;
    this.update((s) => {
      switch (event.type) {
        case "chat":
          s.chat.push({ id: randomUUID(), from: "user", text: event.text, via: event.via, about: event.about, at: Date.now() });
          break;
        case "answers":
          s.answers = { ...s.answers, ...event.answers };
          break;
        case "context_changed":
          s.context = event.context;
          break;
        case "file_approved": {
          const f = s.files.find((f) => f.repo === event.repo && f.path === event.path);
          if (f) f.status = "approved";
          break;
        }
        case "finding_dismiss": {
          const f = s.findings.find((f) => f.id === event.id);
          if (f) f.status = "dismissed";
          // Dismissing is UI-only, unless it clears the last open finding.
          wakesClaude = !s.findings.some((f) => f.status === "open" || f.status === "fixing");
          break;
        }
        case "finding_fix": {
          const f = s.findings.find((f) => f.id === event.id);
          if (f) f.status = "fixing";
          break;
        }
        case "fix_approved": {
          const f = s.findings.find((f) => f.id === event.id);
          if (f) f.status = "fixed";
          break;
        }
        case "fix_rejected": {
          const f = s.findings.find((f) => f.id === event.id);
          if (f?.fix) f.fix.ready = false;
          break;
        }
        case "history_edited":
          // The user's own edits are authoritative; Claude sees them on its next wait.
          if (s.history) s.history.prs = event.prs;
          wakesClaude = false;
          break;
        case "history_changed":
        case "publish":
          if (s.history) s.history.reviewers = event.reviewers;
          if (event.type === "publish" && s.history) s.history.prs = event.prs;
          if (event.type === "history_changed" && !event.text) wakesClaude = false;
          break;
      }
    });
    this.queue.push(event);
    if (wakesClaude) this.wake?.();
  }

  /** Non-blocking: hand Claude whatever the user did since the last call. */
  drain(): UserEvent[] {
    return this.queue.splice(0);
  }

  /** Block until the user does something that needs Claude, or WAIT_MS passes. */
  async waitForUser(): Promise<UserEvent[]> {
    if (this.queue.length) return this.drain();
    this.update((s) => (s.claudeWaiting = true));
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, WAIT_MS);
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    this.wake = null;
    this.update((s) => (s.claudeWaiting = false));
    return this.drain();
  }
}
