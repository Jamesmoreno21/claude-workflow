import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MEMORY_FILE, RUNTIME_DIR, SESSIONS_DIR } from "./constants.js";
import { settings } from "./settings.js";

/** The source checkout's root (the root package.json), or null inside the bundled plugin. */
function findRepoRoot(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, "utf8")).name === "claude-workflow") return dir;
    dir = dirname(dir);
  }
  return null;
}

const repoRoot = findRepoRoot();

export const paths = {
  get webDist() {
    if (settings.webDist) return settings.webDist;
    if (!repoRoot) throw new Error("WORKFLOW_WEB_DIST is not set and no source checkout was found");
    return join(repoRoot, "web", "dist");
  },
  get memoryFile() {
    return join(settings.home, MEMORY_FILE);
  },
  get sessionsDir() {
    return join(settings.home, SESSIONS_DIR);
  },
  /** One file per running cockpit, so the Stop hook can find this session's. */
  get runtimeDir() {
    return join(settings.home, RUNTIME_DIR);
  },
};

export function appVersion(): string {
  if (settings.version) return settings.version;
  return repoRoot ? JSON.parse(readFileSync(join(repoRoot, "server", "package.json"), "utf8")).version : "dev";
}
