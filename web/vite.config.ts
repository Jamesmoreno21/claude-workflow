import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, run `npm run demo` (or a real /workflow) and point Vite at its port.
const target = `http://localhost:${process.env.WORKFLOW_PORT ?? 4545}`;

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/ws": { target, ws: true }, "/api": target } },
});
