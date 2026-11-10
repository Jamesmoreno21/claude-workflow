import type { FileEntry, Finding, PublishMode, RepoRef, Slide } from "../../../shared/protocol";

export const SLIDE_KIND_LABEL: Record<Slide["kind"], string> = {
  overview: "Overview",
  feature: "Product",
  edge_cases: "Edge cases",
  implementation: "Implementation",
  tests: "Tests",
  prs: "Pull requests",
};

export const FILE_STATUS_ICON: Record<FileEntry["status"], string> = { pending: "○", writing: "◐", awaiting_approval: "●", approved: "✓" };

export const FINDING_STATUS_ICON: Record<Finding["status"], string> = { open: "", fixing: "◐", fixed: "✓", dismissed: "–" };

export const SEVERITY_ORDER: Record<Finding["severity"], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const FINISH_MODE: Record<PublishMode, { label: string; hint: string; action: (prs: number) => string }> = {
  local: { label: "Commit locally", hint: "Branches and commits on your machine; nothing is pushed.", action: () => "Create commits" },
  push: { label: "Push branches", hint: "Push the branches to GitHub without opening pull requests.", action: () => "Commit and push" },
  pr: {
    label: "Push and open PRs",
    hint: "Push, open the pull requests, assign you and request reviewers.",
    action: (prs) => `Open ${prs} PR${prs === 1 ? "" : "s"}`,
  },
};

export const REPO_ROLE_LABEL: Record<RepoRef["role"], string> = { change: "Changes", context: "Context only" };
