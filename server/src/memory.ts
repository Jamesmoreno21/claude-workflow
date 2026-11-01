import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RepoRef, TaskContext, WorkflowState } from "../../shared/protocol.js";

/** Everything /workflow remembers between runs, so step 1 is mostly picking. */
export interface Memory {
  styleGuides: { name: string; content: string; usedAt: number }[];
  repos: (RepoRef & { usedAt: number })[];
  reviewers: string[];
}

// Resolved lazily so the demo can point it somewhere else.
const dir = () => process.env.WORKFLOW_HOME ?? join(homedir(), ".claude-workflow");

export function loadMemory(): Memory {
  try {
    return JSON.parse(readFileSync(join(dir(), "memory.json"), "utf8"));
  } catch {
    return { styleGuides: [], repos: [], reviewers: [] };
  }
}

function saveMemory(m: Memory) {
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  writeFileSync(join(dir(), "memory.json"), JSON.stringify(m, null, 2), { mode: 0o600 });
}

export function rememberContext(ctx: TaskContext) {
  const m = loadMemory();
  const now = Date.now();
  for (const r of ctx.repos) {
    m.repos = m.repos.filter((x) => x.path !== r.path);
    m.repos.unshift({ ...r, usedAt: now });
  }
  if (ctx.styleGuide) {
    const name = ctx.styleGuide.split("\n")[0].slice(0, 60);
    m.styleGuides = m.styleGuides.filter((x) => x.content !== ctx.styleGuide);
    m.styleGuides.unshift({ name, content: ctx.styleGuide, usedAt: now });
  }
  m.repos = m.repos.slice(0, 30);
  m.styleGuides = m.styleGuides.slice(0, 15);
  saveMemory(m);
}

export function rememberReviewers(reviewers: string[]) {
  const m = loadMemory();
  m.reviewers = [...new Set([...reviewers, ...m.reviewers])].slice(0, 30);
  saveMemory(m);
}

let pending: NodeJS.Timeout | null = null;

/** Debounced snapshot so a crashed run can be inspected or resumed. */
export function saveSession(state: WorkflowState) {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    const sessions = join(dir(), "sessions");
    mkdirSync(sessions, { recursive: true, mode: 0o700 });
    writeFileSync(join(sessions, `${state.id}.json`), JSON.stringify(state, null, 2), { mode: 0o600 });
  }, 500);
}
