import type { Phase, PublishMode } from "../../../shared/protocol";

/** Phases that show the chat sidebar. */
export const PHASES_WITH_CHAT: Phase[] = ["validation", "plan", "coding", "code_ready", "review", "history"];

/** The header stepper step each phase belongs to; loading phases sit under the step they lead into. */
export const STEP_OF: Record<Phase, Phase> = {
  research: "validation",
  validation: "validation",
  planning: "plan",
  plan: "plan",
  coding: "coding",
  checking: "coding",
  code_ready: "coding",
  reviewing: "review",
  review: "review",
  history: "history",
  publishing: "history",
  published: "published",
  ended: "published",
};

export const LOADING_TITLES: Partial<Record<Phase, string>> = {
  research: "Understanding the task",
  planning: "Building the plan",
  checking: "Running checks on the changes",
};

/** The publishing screen says what will actually happen for the chosen finish. */
export const PUBLISHING_TITLES: Record<PublishMode, string> = {
  local: "Creating the commits",
  push: "Committing and pushing the branches",
  pr: "Pushing and opening the pull requests",
};
