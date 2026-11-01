// Contract between the MCP server (driven by Claude Code) and the web UI.
// The server pushes a full `WorkflowState` snapshot on every change; the UI
// sends `UserEvent`s back, which Claude receives from its waiting tools.

export type Phase =
  "research" | "validation" | "planning" | "plan" | "coding" | "code_ready" | "review" | "history" | "publishing" | "published";

export const PHASES: { id: Phase; label: string }[] = [
  { id: "validation", label: "Validation" },
  { id: "plan", label: "Plan" },
  { id: "coding", label: "Coding" },
  { id: "review", label: "Review" },
  { id: "history", label: "Commits" },
  { id: "published", label: "Published" },
];

// Enum values live in arrays so the MCP schemas can reuse them.
export const REPO_ROLES = ["change", "context"] as const;
export const QUESTION_STAGES = ["product", "technical"] as const;
export const SLIDE_KINDS = ["overview", "feature", "edge_cases", "implementation", "tests", "prs"] as const;
export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export const FINDING_CATEGORIES = ["bug", "security", "constraint", "style", "test", "perf", "other"] as const;

export interface RepoRef {
  path: string;
  name: string;
  /** "change" repos get edits; "context" repos are only read. */
  role: (typeof REPO_ROLES)[number];
}

export interface TaskContext {
  title: string;
  task: string;
  taskUrl?: string;
  repos: RepoRef[];
  design?: string;
  styleGuide?: string;
}

/* ---------- Validation ---------- */

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  /** A concrete scenario showing what picking this option means. */
  example?: string;
}

export interface Question {
  id: string;
  stage: (typeof QUESTION_STAGES)[number];
  title: string;
  /** Everything needed to understand the question without the terminal. */
  context: string;
  /** Example of the condition being decided. Shown under "+". */
  example?: string;
  options: QuestionOption[];
  recommended?: string;
}

export interface Answer {
  optionId?: string;
  text?: string;
}

/* ---------- Plan ---------- */

export interface Slide {
  id: string;
  title: string;
  kind: (typeof SLIDE_KINDS)[number];
  /** What Claude says out loud on this slide. */
  narration: string;
  /** Markdown body. */
  body: string;
  /** Optional mermaid diagram source. */
  diagram?: string;
  files?: { repo: string; path: string; note?: string }[];
  tests?: string[];
}

export interface PlannedPR {
  repo: string;
  title: string;
  estimatedLines: number;
  scope: string;
}

export interface Plan {
  slides: Slide[];
  prs: PlannedPR[];
  /** Architecture layers this task touches, outermost first (e.g. UI, API, Service, Data, Tests). */
  layers?: string[];
}

/* ---------- Coding ---------- */

export interface FileEntry {
  repo: string;
  path: string;
  /** Which plan slide this file implements. */
  planRef?: string;
  intent?: string;
  /** Architecture layer, one of Plan.layers. */
  layer?: string;
  status: "pending" | "writing" | "awaiting_approval" | "approved";
  before?: string;
  after?: string;
  /** Bumps every time Claude rewrites the file, so the UI replays it. */
  revision: number;
}

export interface CodeSummary {
  markdown: string;
  stats: { repo: string; files: number; added: number; removed: number }[];
}

/* ---------- Review ---------- */

export interface Finding {
  id: number;
  severity: (typeof SEVERITIES)[number];
  category: (typeof FINDING_CATEGORIES)[number];
  repo: string;
  path: string;
  line: number;
  title: string;
  body: string;
  suggestion?: string;
  status: "open" | "fixing" | "fixed" | "dismissed";
  /** Which reviewer agent raised it. */
  source?: string;
  /** Set once Claude has a fix ready for approval. */
  fix?: { before: string; after: string; ready: boolean };
}

/** Open or being fixed: still needs the user before the review is clear. */
export const isUnresolved = (f: Finding) => f.status === "open" || f.status === "fixing";

/* ---------- Commit history ---------- */

export interface ProposedCommit {
  message: string;
  files: string[];
  added: number;
  removed: number;
}

export interface ProposedPR {
  id: string;
  repo: string;
  branch: string;
  base: string;
  title: string;
  body: string;
  commits: ProposedCommit[];
  dependsOn?: string;
}

export interface History {
  prs: ProposedPR[];
  reviewers: string[];
  assignee?: string;
}

export interface PublishedLink {
  repo: string;
  title: string;
  url: string;
}

/* ---------- Chat ---------- */

export interface ChatMessage {
  id: string;
  from: "user" | "claude";
  text: string;
  via?: "voice" | "text";
  at: number;
  /** What the message is about, e.g. "finding:3", "slide:s2", "file:api/user.ts". */
  about?: string;
}

/* ---------- State ---------- */

export interface WorkflowState {
  id: string;
  phase: Phase;
  context: TaskContext;
  status: { message: string; log: string[] };
  questions: Question[];
  answers: Record<string, Answer>;
  plan: Plan | null;
  files: FileEntry[];
  summary: CodeSummary | null;
  findings: Finding[];
  history: History | null;
  published: PublishedLink[];
  chat: ChatMessage[];
  /** True while Claude is blocked on the user. False = Claude is working. */
  claudeWaiting: boolean;
  memory: { reviewers: string[] };
}

/* ---------- Events: UI -> Claude ---------- */

export type UserEvent =
  | { type: "answers"; answers: Record<string, Answer> }
  | { type: "chat"; text: string; via: "voice" | "text"; about?: string }
  | { type: "plan_approved" }
  | { type: "file_approved"; repo: string; path: string }
  | { type: "file_feedback"; repo: string; path: string; text: string }
  | { type: "start_review" }
  | { type: "finding_fix"; id: number; note?: string }
  | { type: "finding_dismiss"; id: number }
  | { type: "fix_approved"; id: number }
  | { type: "fix_rejected"; id: number; text?: string }
  | { type: "history_changed"; reviewers: string[]; text?: string }
  | { type: "history_edited"; prs: ProposedPR[] }
  | { type: "publish"; reviewers: string[]; prs: ProposedPR[] }
  | { type: "context_changed"; context: TaskContext };

export type ServerMessage = { type: "state"; state: WorkflowState };
