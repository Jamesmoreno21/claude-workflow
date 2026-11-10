// Claude Code Stop hook. While this session's workflow cockpit is open, the user
// works in the browser, not the terminal, so Claude is asked to call
// workflow_wait instead of ending its turn.
import { stopHookOutput, thisSessionsCockpit } from "./stop-decision.js";

// Never fail the session, whatever happens here.
try {
  const output = stopHookOutput(thisSessionsCockpit());
  if (output) process.stdout.write(output);
} catch (err) {
  console.error("[workflow] stop hook:", err);
}
