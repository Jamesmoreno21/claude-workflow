import { defineConfig, devices } from "@playwright/test";

const PORT = 4700;

// Drives the scripted demo (a fake Claude) through every phase of the cockpit.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "node server/bin/demo.js --no-open",
    url: `http://localhost:${PORT}`,
    env: { WORKFLOW_PORT: String(PORT), DEMO_SPEED: "0.1" },
    reuseExistingServer: false,
  },
});
