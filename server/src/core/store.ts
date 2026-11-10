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
      plan: null,
      files: [],
      summary: null,
      findings: [],
      history: null,
      outcome: null,
      chat: [],
      claudeWaiting: false,
      waitCount: 0,
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
    const needsClaude = this.apply(event);
    this.pendingEvents.push(event);
    if (!needsClaude) return;
    if (this.wakeClaude) this.wakeClaude();
    else if (!this.idlePingSent) {
      this.idlePingSent = true;
      this.onUserActsWhileClaudeIdle?.();
    }
  }

  /** Updates the state for an event; returns whether Claude must react now. */
  private apply(event: UserEvent): boolean {
    let needsClaude = true;
    const finding = (id: number): Finding | undefined => this.state.findings.find((f) => f.id === id);
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
          break;
        case "context_changed":
          s.context = event.context;
          break;
        case "file_edited":
          // Claude learns about it with the next event that needs it.
          needsClaude = false;
          break;
        case "end_workflow":
          s.phase = "ended";
          break;
        case "file_approved": {
          const file = s.files.find((f) => f.repo === event.repo && f.path === event.path);
          if (file) file.status = "approved";
          break;
        }
        case "finding_dismiss": {
          const f = finding(event.id);
          if (f) f.status = "dismissed";
          // Dismissing needs no work from Claude, unless it clears the review.
          needsClaude = !s.findings.some(isUnresolved);
          break;
        }
        case "finding_fix": {
          const f = finding(event.id);
          if (f) f.status = "fixing";
          break;
        }
        case "fix_approved": {
          const f = finding(event.id);
          if (f) f.status = "fixed";
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
    return this.drain();
  }
}
