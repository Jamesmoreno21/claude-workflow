import type { FileEntry, Finding, RepoRef, Slide } from "../../../shared/protocol";

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

export const REPO_ROLE_LABEL: Record<RepoRef["role"], string> = { change: "Changes", context: "Context only" };
