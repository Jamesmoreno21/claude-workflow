import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, run `npm run demo` (or a real /workflow) and point Vite at its port.
const target = `http://localhost:${process.env.WORKFLOW_PORT ?? 4545}`;

export default defineConfig({
  plugins: [react()],
  // The Kokoro worker uses import.meta; keep it an ES module worker.
  worker: { format: "es" },
  server: { proxy: { "/ws": { target, ws: true }, "/api": target } },
});
