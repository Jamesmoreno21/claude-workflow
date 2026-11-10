import { describe, expect, it } from "vitest";
import { clearRuntime, findRuntime, liveRuntimes, publishRuntime } from "./runtime.js";

describe("runtime registry", () => {
  it("registers this server under its Claude Code process and forgets it on clear", () => {
    publishRuntime({ url: "http://localhost:4545", phase: "coding" });
    expect(findRuntime([999_999, process.ppid])).toMatchObject({ claudePid: process.ppid, serverPid: process.pid, phase: "coding" });
    expect(liveRuntimes().some((e) => e.serverPid === process.pid)).toBe(true);

    clearRuntime();
    expect(findRuntime([process.ppid])).toBeNull();
  });
});
