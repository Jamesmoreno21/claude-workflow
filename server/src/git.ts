import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { RepoRef } from "../../shared/protocol.js";

export function resolveRepo(repos: RepoRef[], name: string): RepoRef {
  const repo = repos.find((r) => r.name === name || r.path === name);
  if (!repo) throw new Error(`Unknown repo "${name}". Known: ${repos.map((r) => r.name).join(", ")}`);
  return repo;
}

/** Resolves a repo-relative path, refusing anything that escapes the repo. */
export function insideRepo(repoPath: string, file: string): string {
  const full = resolve(repoPath, file);
  const rel = relative(resolve(repoPath), full);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Path "${file}" is outside the repository`);
  return full;
}

/** The file as it is at HEAD, or "" when it is new. */
export function readAtHead(repoPath: string, file: string): string {
  insideRepo(repoPath, file);
  try {
    return execFileSync("git", ["-C", repoPath, "show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

export function readWorking(repoPath: string, file: string): string {
  const full = insideRepo(repoPath, file);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

/** Added/removed line counts of the working tree against HEAD. */
export function diffStat(repoPath: string): { files: number; added: number; removed: number } {
  try {
    const out = execFileSync("git", ["-C", repoPath, "diff", "--numstat", "HEAD"], { encoding: "utf8" });
    let added = 0;
    let removed = 0;
    const lines = out.trim().split("\n").filter(Boolean);
    for (const l of lines) {
      const [a, r] = l.split("\t");
      added += Number(a) || 0;
      removed += Number(r) || 0;
    }
    // New files are invisible to `git diff` until staged; count them by hand.
    const untracked = execFileSync("git", ["-C", repoPath, "ls-files", "--others", "--exclude-standard"], { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const f of untracked) added += readWorking(repoPath, f).split("\n").length;
    return { files: lines.length + untracked.length, added, removed };
  } catch {
    return { files: 0, added: 0, removed: 0 };
  }
}
