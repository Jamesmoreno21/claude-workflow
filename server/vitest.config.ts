import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    env: {
      // Waiting tools time out fast, and memory never touches ~/.claude-workflow.
      WORKFLOW_WAIT_MS: "300",
      WORKFLOW_HOME: mkdtempSync(join(tmpdir(), "wf-test-home-")),
    },
  },
});
