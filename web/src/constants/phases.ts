import type { Phase } from "../../../shared/protocol";

/** Phases that show the chat sidebar. */
export const PHASES_WITH_CHAT: Phase[] = ["validation", "plan", "coding", "code_ready", "review", "history"];

/** The header stepper step each phase belongs to; loading phases sit under the step they lead into. */
export const STEP_OF: Record<Phase, Phase> = {
  research: "validation",
  validation: "validation",
  planning: "plan",
  plan: "plan",
  coding: "coding",
  code_ready: "coding",
  review: "review",
  history: "history",
  publishing: "history",
  published: "published",
  ended: "published",
};

export const LOADING_TITLES: Partial<Record<Phase, string>> = {
  research: "Understanding the task",
  planning: "Building the plan",
  publishing: "Publishing to GitHub",
};
