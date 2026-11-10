import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Phase } from "../../../shared/protocol.js";
import { paths } from "../config/paths.js";

// Each running cockpit registers itself under the Claude Code process that
// launched its MCP server. The Stop hook runs under that same process, so it
// can tell whether *its* session has a workflow open.

export interface RuntimeEntry {
  /** The Claude Code process (the MCP server's parent). */
  claudePid: number;
  serverPid: number;
  url: string;
  phase: Phase;
  updatedAt: number;
}

const entryFile = (claudePid: number) => join(paths.runtimeDir, `${claudePid}.json`);

export function publishRuntime(entry: Omit<RuntimeEntry, "claudePid" | "serverPid" | "updatedAt">) {
  mkdirSync(paths.runtimeDir, { recursive: true, mode: 0o700 });
  const full: RuntimeEntry = { ...entry, claudePid: process.ppid, serverPid: process.pid, updatedAt: Date.now() };
  writeFileSync(entryFile(process.ppid), JSON.stringify(full), { mode: 0o600 });
}

export function clearRuntime() {
  rmSync(entryFile(process.ppid), { force: true });
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** The live cockpit registered under any of these process ids, if one exists. */
export function findRuntime(candidatePids: number[]): RuntimeEntry | null {
  if (!existsSync(paths.runtimeDir)) return null;
  for (const pid of candidatePids) {
    const file = entryFile(pid);
    if (!existsSync(file)) continue;
    const entry = JSON.parse(readFileSync(file, "utf8")) as RuntimeEntry;
    if (isAlive(entry.serverPid)) return entry;
    rmSync(file, { force: true }); // left behind by a crashed server
  }
  return null;
}

/** All live cockpits, for platforms where the process tree can't be walked. */
export function liveRuntimes(): RuntimeEntry[] {
  if (!existsSync(paths.runtimeDir)) return [];
  return readdirSync(paths.runtimeDir)
    .map((name) => Number(name.replace(/\.json$/, "")))
    .map((pid) => findRuntime([pid]))
    .filter((entry): entry is RuntimeEntry => entry !== null);
}
