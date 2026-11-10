// Values both the server and the UI rely on. SKILL.md and the README quote
// the size limits in prose; keep them in sync when changing these.

/** PRs should stay under the target; above the max they're flagged red. */
export const PR_LINES_TARGET = 1000;
export const PR_LINES_MAX = 1500;
export const COMMIT_LINES_TARGET = 300;
export const COMMIT_LINES_MAX = 400;

export const DEFAULT_PORT = 4545;

export const ROUTES = {
  socket: "/ws",
  state: "/api/state",
  tts: "/api/tts",
  ttsProviders: "/api/tts/providers",
  inspectRepo: "/api/repos/inspect",
  tree: "/api/tree",
  file: "/api/file",
} as const;
