import type { UserEvent } from "../../../shared/protocol.js";

/** What Claude should do after each kind of user event; sent with every result. */
const NEXT_STEP: Partial<Record<UserEvent["type"], string>> = {
  chat: "Answer with workflow_reply (short, spoken-friendly), act on it if it asks for a change, then call workflow_wait.",
  answers: "If every question is answered, move on (technical questions, then the plan).",
  plan_approved: "Plan approved. Start coding: workflow_begin_file for the first file.",
  file_feedback: "Rework that file, then call workflow_file_ready again.",
  file_approved: "Move to the next file in the plan (or workflow_code_ready if all are done).",
  start_review: "Launch the reviewer subagents, then call workflow_review with their findings.",
  finding_fix: "Fix that finding in the code, then call workflow_fix_ready with its id.",
  fix_rejected: "Rework the fix (see the note), then call workflow_fix_ready again.",
  history_changed: "Revise the proposal and call workflow_propose_history again.",
  history_edited: "The user edited PR titles, descriptions or commit messages. Treat their version as final; don't overwrite it.",
  publish:
    "Create branches, commits and PRs exactly as in this event's `prs` (it includes the user's edits), then call workflow_published.",
  context_changed: "The user edited the task context in the gear panel. Re-read it and adjust.",
};

const STILL_WAITING = "The user is still working. Call workflow_wait to keep waiting.";

export const text = (message: string) => ({ content: [{ type: "text" as const, text: message }] });

/** The user's events plus the next steps they call for. */
export function eventsResult(events: UserEvent[], extra?: Record<string, unknown>) {
  const next = events.length ? [...new Set(events.map((e) => NEXT_STEP[e.type]).filter(Boolean))] : [STILL_WAITING];
  return text(JSON.stringify({ events, next, ...extra }, null, 2));
}
