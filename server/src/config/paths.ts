import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MEMORY_FILE, SESSIONS_DIR } from "./constants.js";
import { settings } from "./settings.js";

/**
 * The repo root, found by walking up to the root package.json. Works from
 * both src/ (tests) and dist/server/src/ (built), at any folder depth.
 */
function findRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, "utf8")).name === "claude-workflow") return dir;
    dir = dirname(dir);
  }
  throw new Error("Could not find the claude-workflow root");
}

const root = findRoot();

export const paths = {
  root,
  webDist: join(root, "web", "dist"),
  serverPackage: join(root, "server", "package.json"),
  get memoryFile() {
    return join(settings.home, MEMORY_FILE);
  },
  get sessionsDir() {
    return join(settings.home, SESSIONS_DIR);
  },
};
