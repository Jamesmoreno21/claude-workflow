import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { FileContents, RepoInspection, RepoTree } from "../../../shared/protocol.js";
import { MAX_EDITOR_FILE_BYTES, MAX_TREE_FILES } from "../config/constants.js";

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

// The functions below serve HTTP requests, so they're async: a slow git command or
// a folder macOS asks permission for must never freeze the cockpit's server.

const GIT_TIMEOUT_MS = 15_000;
const PATH_CHECK_TIMEOUT_MS = 5_000;
const runGit = promisify(execFile);

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await runGit("git", ["-C", repoPath, ...args], { timeout: GIT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function readText(full: string): Promise<string> {
  try {
    return await readFile(full, "utf8");
  } catch {
    return "";
  }
}

/** Checks that a user-typed path is (inside) a git repository and returns its root. */
export async function inspectRepo(input: string): Promise<RepoInspection> {
  const path = resolve(input.trim().replace(/^~(?=$|\/)/, homedir()));
  // macOS can hold a stat of a protected folder (Downloads, Documents…) while it asks for permission.
  const access = await Promise.race([
    stat(path).then(
      () => "ok" as const,
      () => "missing" as const,
    ),
    new Promise<"slow">((done) => setTimeout(() => done("slow"), PATH_CHECK_TIMEOUT_MS)),
  ]);
  if (access === "missing") return { ok: false, error: `${path} doesn't exist` };
  if (access === "slow") return { ok: false, error: `Couldn't read ${path}; macOS may be asking for permission to that folder` };
  try {
    const root = (await git(path, "rev-parse", "--show-toplevel")).trim();
    return { ok: true, path: root, name: basename(root) };
  } catch {
    return { ok: false, error: `${path} isn't a git repository` };
  }
}

/** Every file the editor can open (tracked plus untracked, minus ignored) and which changed. */
export async function repoTree(repoPath: string): Promise<RepoTree> {
  const [listed, status] = await Promise.all([
    git(repoPath, "ls-files", "--cached", "--others", "--exclude-standard"),
    git(repoPath, "status", "--porcelain", "--untracked-files=all"),
  ]);
  const all = [...new Set(listed.split("\n").filter(Boolean))].sort();
  const changed: Record<string, string> = {};
  for (const line of status.split("\n").filter(Boolean)) {
    const code = line.slice(0, 2).trim();
    const path = line.slice(3).split(" -> ").pop()!;
    changed[path] = code === "??" ? "?" : code[0] === " " ? code[1] : code[0];
  }
  return { files: all.slice(0, MAX_TREE_FILES), changed, truncated: all.length > MAX_TREE_FILES };
}

/** A file for the editor; binary and oversized files aren't opened. */
export async function fileContents(repoPath: string, file: string, editable: boolean): Promise<FileContents> {
  const full = insideRepo(repoPath, file);
  const size = await stat(full).then(
    (s) => s.size,
    () => 0,
  );
  if (size > MAX_EDITOR_FILE_BYTES) return { binary: true };
  const working = await readText(full);
  if (working.includes("\0")) return { binary: true };
  const head = await git(repoPath, "show", `HEAD:${file}`).catch(() => "");
  return { head, working, binary: false, editable };
}

export class SaveConflictError extends Error {}

/** Saves the user's edit, refusing if the file changed on disk since they opened it. */
export async function saveFile(repoPath: string, file: string, content: string, base: string) {
  const full = insideRepo(repoPath, file);
  if ((await readText(full)) !== base) throw new SaveConflictError(`${file} changed on disk since you opened it`);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}
