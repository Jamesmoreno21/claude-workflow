// Decides whether the Stop hook should keep Claude listening: only while this
// session's own cockpit is open and not finished.
import { execFileSync } from "node:child_process";
import { FINISHED_PHASES } from "../../../shared/protocol.js";
import { findRuntime, liveRuntimes, type RuntimeEntry } from "../services/runtime.js";

const MAX_ANCESTORS = 8;

/** This process's parent chain; the Claude Code session is one of them. */
function ancestorPids(): number[] {
  const pids: number[] = [];
  let pid = process.ppid;
  for (let i = 0; i < MAX_ANCESTORS && pid > 1; i++) {
    pids.push(pid);
    try {
      pid = Number(execFileSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" }).trim());
    } catch {
      break;
    }
  }
  return pids;
}

export function thisSessionsCockpit(): RuntimeEntry | null {
  const found = findRuntime(ancestorPids());
  if (found) return found;
  // Without `ps` (e.g. Windows), only an unambiguous single cockpit counts.
  const live = liveRuntimes();
  return live.length === 1 ? live[0] : null;
}

export function stopHookOutput(cockpit: RuntimeEntry | null): string | null {
  if (!cockpit || FINISHED_PHASES.includes(cockpit.phase)) return null;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext:
        `The workflow cockpit (${cockpit.url}) is still open in phase "${cockpit.phase}", and the user works there, not in the terminal. ` +
        "Call workflow_wait to receive their next action. If the user asked in the terminal to stop the workflow, call workflow_end instead.",
    },
  });
}
