import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RepoRef, TaskContext, WorkflowState } from "../../../shared/protocol.js";
import { MEMORY_LIMITS, SESSION_SAVE_DEBOUNCE_MS } from "../config/constants.js";
import { paths } from "../config/paths.js";

/** What /workflow remembers between runs, so step 1 is mostly picking. */
export interface Memory {
  styleGuides: { name: string; content: string; usedAt: number }[];
  repos: (RepoRef & { usedAt: number })[];
  reviewers: string[];
}

/** Task text and code can be private: owner-only files. */
function writePrivate(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function loadMemory(): Memory {
  try {
    return JSON.parse(readFileSync(paths.memoryFile, "utf8"));
  } catch {
    return { styleGuides: [], repos: [], reviewers: [] };
  }
}

/** Most recently used first, capped. */
export function rememberContext(context: TaskContext) {
  const memory = loadMemory();
  const now = Date.now();
  for (const repo of context.repos) {
    memory.repos = [{ ...repo, usedAt: now }, ...memory.repos.filter((r) => r.path !== repo.path)];
  }
  if (context.styleGuide) {
    const name = context.styleGuide.split("\n")[0].slice(0, MEMORY_LIMITS.styleGuideName);
    const others = memory.styleGuides.filter((g) => g.content !== context.styleGuide);
    memory.styleGuides = [{ name, content: context.styleGuide, usedAt: now }, ...others];
  }
  memory.repos = memory.repos.slice(0, MEMORY_LIMITS.repos);
  memory.styleGuides = memory.styleGuides.slice(0, MEMORY_LIMITS.styleGuides);
  writePrivate(paths.memoryFile, memory);
}

export function rememberReviewers(reviewers: string[]) {
  const memory = loadMemory();
  memory.reviewers = [...new Set([...reviewers, ...memory.reviewers])].slice(0, MEMORY_LIMITS.reviewers);
  writePrivate(paths.memoryFile, memory);
}

let pendingSave: NodeJS.Timeout | null = null;

/** Debounced snapshot of the run, so a crashed session can be inspected. */
export function saveSession(state: WorkflowState) {
  if (pendingSave) return;
  pendingSave = setTimeout(() => {
    pendingSave = null;
    writePrivate(join(paths.sessionsDir, `${state.id}.json`), state);
  }, SESSION_SAVE_DEBOUNCE_MS);
}
