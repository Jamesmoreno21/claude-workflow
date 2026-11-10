import type { UserEvent } from "../../../shared/protocol.js";

/** What Claude should do after each kind of user event; sent with every result. */
const NEXT_STEP: Partial<Record<UserEvent["type"], string>> = {
  chat: "Answer with workflow_reply (short, spoken-friendly), act on it if it asks for a change, then call workflow_wait.",
  answers: "If every question is answered, move on (technical questions, then the plan).",
  plan_approved: "Plan approved. Start coding: workflow_begin_file for the first file.",
  file_feedback: "Rework that file, then call workflow_file_ready again.",
  file_approved:
    "Move to the next file in the plan. Don't run tests, builds or agents between files: once every file is approved, run the checks once (workflow_status with phase 'checking'), then workflow_code_ready with the results.",
  start_review:
    "Call workflow_reviewers with every reviewer agent as 'running', launch them, update each one's status and finding count as it finishes, then call workflow_review with the merged findings.",
  finding_fix:
    "Fix that finding, then call workflow_fix_ready with its id. It returns at once; work through every queued finding_fix the same way, then call workflow_wait.",
  fix_rejected: "Rework the fix (see the note), then call workflow_fix_ready again.",
  finding_fixed_manually:
    "The user fixed this finding themselves in the editor. Re-read the file before touching it again; nothing else to do unless it's still wrong.",
  history_changed: "Revise the proposal and call workflow_propose_history again.",
  history_edited: "The user edited PR titles, descriptions or commit messages. Treat their version as final; don't overwrite it.",
  publish:
    "Create the branches and commits exactly as in this event's `prs` (it includes the user's edits). Then, by `mode`: 'local' stop there (don't push); 'push' push the branches; 'pr' push and open the PRs. Then call workflow_published with the mode.",
  file_edited:
    "The user edited this file in the cockpit editor. Re-read it before relying on its contents, and build on their changes instead of overwriting them.",
  end_workflow: "The user ended the workflow from the cockpit. Stop calling workflow tools and say one line in the terminal.",
  context_changed: "The user edited the task context in the gear panel. Re-read it and adjust.",
};

const STILL_WAITING = "The user is still working. Call workflow_wait to keep waiting.";

export const text = (message: string) => ({ content: [{ type: "text" as const, text: message }] });

/** The user's events plus the next steps they call for. */
export function eventsResult(events: UserEvent[], extra?: Record<string, unknown>) {
  const next = events.length ? [...new Set(events.map((e) => NEXT_STEP[e.type]).filter(Boolean))] : [STILL_WAITING];
  return text(JSON.stringify({ events, next, ...extra }, null, 2));
}
