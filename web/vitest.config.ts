import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Diagrams render through mermaid, which needs a real browser; the e2e covers it.
    alias: { mermaid: new URL("./src/test/mermaid-stub.ts", import.meta.url).pathname },
  },
});
