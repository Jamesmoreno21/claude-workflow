import { randomUUID } from "node:crypto";
import { isUnresolved, type Finding, type TaskContext, type UserEvent, type WorkflowState } from "../../../shared/protocol.js";
import { INITIAL_STATUS, RUN_ID_LENGTH } from "../config/constants.js";
import { settings } from "../config/settings.js";
import { saveSession } from "../services/memory.js";

type Listener = (state: WorkflowState) => void;

/**
 * Single source of truth for one workflow run. Claude changes it through the
 * MCP tools, the UI through events, and every change is broadcast as a snapshot.
 */
export class Store {
  state: WorkflowState;
  private listeners = new Set<Listener>();
  private pendingEvents: UserEvent[] = [];
  private wakeClaude: (() => void) | null = null;
  private idlePingSent = false;
  private resumeWaiters: (() => void)[] = [];
  /** Called once when the user acts while Claude isn't waiting (e.g. to ping its session). */
  onUserActsWhileClaudeIdle: (() => void) | null = null;

  constructor(context: TaskContext, reviewers: string[]) {
    this.state = Store.freshState(context, reviewers);
  }

  private static freshState(context: TaskContext, reviewers: string[]): WorkflowState {
    return {
      id: randomUUID().slice(0, RUN_ID_LENGTH),
      phase: "research",
      context,
      status: { message: INITIAL_STATUS, log: [] },
      questions: [],
      answers: {},
      submitted: [],
      plan: null,
      files: [],
      summary: null,
      findings: [],
      history: null,
      publishMode: null,
      outcome: null,
      reviewers: [],
      chat: [],
      claudeWaiting: false,
      waitCount: 0,
      queued: { count: 0, since: null },
      paused: false,
      codeApproval: "every",
      memory: { reviewers },
    };
  }

  /**
   * Starts a new run in the same cockpit: nothing from the previous task
   * (questions, answers, files, findings, chat, queued events) carries over.
   */
  reset(context: TaskContext, reviewers: string[]) {
    this.pendingEvents = [];
    this.idlePingSent = false;
    this.wakeClaude?.();
    this.resumeWaiters.splice(0).forEach((resume) => resume());
    this.state = Store.freshState(context, reviewers);
    for (const listener of this.listeners) listener(this.state);
    saveSession(this.state);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  update(change: (state: WorkflowState) => void) {
    change(this.state);
    for (const listener of this.listeners) listener(this.state);
    saveSession(this.state);
  }

  /** Applies an event from the UI and queues it for Claude. */
  push(event: UserEvent) {
    if (event.type === "pause" || event.type === "resume") return this.setPaused(event.type === "pause");
    const needsClaude = this.apply(event);
    this.pendingEvents.push(event);
    if (!needsClaude) return;
    this.update((s) => (s.queued = { count: s.queued.count + 1, since: s.queued.since ?? Date.now() }));
    if (this.state.paused) return; // kept for when the user resumes
    if (this.wakeClaude) this.wakeClaude();
    else if (!this.idlePingSent) {
      this.idlePingSent = true;
      this.onUserActsWhileClaudeIdle?.();
    }
  }

  /** Pausing holds Claude at its next workflow call; resuming lets it go and hands it anything queued. */
  private setPaused(paused: boolean) {
    this.update((s) => (s.paused = paused));
    if (paused) return;
    this.resumeWaiters.splice(0).forEach((resume) => resume());
    if (this.state.queued.count) this.wakeClaude?.();
  }

  /** Resolves true at once, or when the user resumes; false if still paused after the wait timeout. */
  untilResumed(): Promise<boolean> {
    if (!this.state.paused) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), settings.waitMs);
      this.resumeWaiters.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  /** Updates the state for an event; returns whether Claude must react now. */
  private apply(event: UserEvent): boolean {
    let needsClaude = true;
    const finding = (id: number): Finding | undefined => this.state.findings.find((f) => f.id === id);
    // Resolving a finding needs Claude only once its repo has nothing left open (to run that repo's checks).
    const resolve = (id: number, status: "fixed" | "dismissed") => {
      const f = finding(id);
      if (!f) return false;
      f.status = status;
      return !this.state.findings.some((x) => x.repo === f.repo && isUnresolved(x));
    };
    this.update((s) => {
      switch (event.type) {
        case "chat":
          s.chat.push({
            id: randomUUID(),
            from: "user",
            text: event.text,
            via: event.via,
            about: event.about,
            selection: event.selection,
            at: Date.now(),
          });
          break;
        case "answers":
          s.answers = { ...s.answers, ...event.answers };
          s.submitted = [...new Set([...s.submitted, ...Object.keys(event.answers)])];
          break;
        case "context_changed":
          s.context = event.context;
          break;
        case "file_edited":
          // Claude learns about it with the next event that needs it.
          needsClaude = false;
          break;
        case "start_review":
          // Reviewing starts now: the start button can't be pressed twice while agents work.
          s.phase = "reviewing";
          s.reviewers = [];
          break;
        case "finding_fixed_manually":
        case "fix_approved":
          needsClaude = resolve(event.id, "fixed");
          break;
        case "end_workflow":
          s.phase = "ended";
          break;
        case "plan_approved":
          s.codeApproval = event.approval;
          break;
        case "file_approved": {
          const file = s.files.find((f) => f.repo === event.repo && f.path === event.path);
          if (file) file.status = "approved";
          break;
        }
        case "finding_dismiss":
          needsClaude = resolve(event.id, "dismissed");
          break;
        case "finding_fix": {
          const f = finding(event.id);
          if (f) f.status = "fixing";
          break;
        }
        case "fix_rejected": {
          const f = finding(event.id);
          if (f?.fix) f.fix.ready = false;
          break;
        }
        case "history_edited":
          // The user's own edits are final; Claude sees them on its next wait.
          if (s.history) s.history.prs = event.prs;
          needsClaude = false;
          break;
        case "history_changed":
          if (s.history) s.history.reviewers = event.reviewers;
          needsClaude = Boolean(event.text);
          break;
        case "publish":
          s.publishMode = event.mode;
          if (s.history) {
            s.history.reviewers = event.reviewers;
            s.history.prs = event.prs;
          }
          break;
      }
    });
    return needsClaude;
  }

  /** Everything the user did since Claude last looked, without waiting. */
  drain(): UserEvent[] {
    this.idlePingSent = false;
    if (this.state.queued.count) this.update((s) => (s.queued = { count: 0, since: null }));
    return this.pendingEvents.splice(0);
  }

  /** Blocks until the user does something that needs Claude, or the wait times out. */
  async waitForUser(): Promise<UserEvent[]> {
    if (this.pendingEvents.length) return this.drain();
    this.update((s) => {
      s.claudeWaiting = true;
      s.waitCount += 1;
    });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, settings.waitMs);
      this.wakeClaude = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    this.wakeClaude = null;
    this.update((s) => (s.claudeWaiting = false));
    // Paused meanwhile: keep the events for when the user resumes.
    return this.state.paused ? [] : this.drain();
  }
}
