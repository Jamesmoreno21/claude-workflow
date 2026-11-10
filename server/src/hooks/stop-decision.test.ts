import { describe, expect, it } from "vitest";
import type { RuntimeEntry } from "../services/runtime.js";
import { stopHookOutput } from "./stop-decision.js";

const cockpit = (phase: RuntimeEntry["phase"]): RuntimeEntry => ({
  claudePid: 1,
  serverPid: 2,
  url: "http://localhost:4545",
  phase,
  updatedAt: 0,
});

describe("stopHookOutput", () => {
  it("keeps Claude listening while this session's cockpit is open", () => {
    const output = JSON.parse(stopHookOutput(cockpit("validation"))!);
    expect(output.hookSpecificOutput.hookEventName).toBe("Stop");
    expect(output.hookSpecificOutput.additionalContext).toMatch(/workflow_wait/);
    expect(output.hookSpecificOutput.additionalContext).toMatch(/workflow_end/);
  });

  it("lets Claude stop when there's no cockpit, or it has finished", () => {
    expect(stopHookOutput(null)).toBeNull();
    expect(stopHookOutput(cockpit("published"))).toBeNull();
    expect(stopHookOutput(cockpit("ended"))).toBeNull();
  });
});
