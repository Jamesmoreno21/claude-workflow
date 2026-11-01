import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export interface DiffStat {
  files: number;
  added: number;
  removed: number;
}

/** Resolves a repo-relative path, refusing anything that escapes the repo. */
export function insideRepo(repoPath: string, file: string): string {
  const full = resolve(repoPath, file);
  const rel = relative(resolve(repoPath), full);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Path "${file}" is outside the repository`);
  return full;
}

/** The file as committed at HEAD, or "" when it is new. */
export function readAtHead(repoPath: string, file: string): string {
  insideRepo(repoPath, file);
  try {
    return execFileSync("git", ["-C", repoPath, "show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

/** The file as it is on disk now, or "" when it doesn't exist. */
export function readWorking(repoPath: string, file: string): string {
  const full = insideRepo(repoPath, file);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

/** Lines added and removed in the working tree against HEAD, new files included. */
export function diffStat(repoPath: string): DiffStat {
  const git = (...args: string[]) => execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" });
  try {
    const tracked = git("diff", "--numstat", "HEAD").trim().split("\n").filter(Boolean);
    // New files are invisible to `git diff` until staged; count them without touching the index.
    const untracked = git("ls-files", "--others", "--exclude-standard").trim().split("\n").filter(Boolean);
    const stat: DiffStat = { files: tracked.length + untracked.length, added: 0, removed: 0 };
    for (const line of tracked) {
      const [added, removed] = line.split("\t");
      stat.added += Number(added) || 0;
      stat.removed += Number(removed) || 0;
    }
    for (const file of untracked) stat.added += readWorking(repoPath, file).split("\n").length;
    return stat;
  } catch {
    return { files: 0, added: 0, removed: 0 };
  }
}
