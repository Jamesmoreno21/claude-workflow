import { COMMIT_LINES_MAX, COMMIT_LINES_TARGET, PR_LINES_MAX, PR_LINES_TARGET } from "../../../shared/constants";
import type { ProposedPR } from "../../../shared/protocol";

export type SizeClass = "ok" | "warn" | "bad";

const classify = (lines: number, target: number, max: number): SizeClass => (lines > max ? "bad" : lines > target ? "warn" : "ok");

export const prSizeClass = (lines: number) => classify(lines, PR_LINES_TARGET, PR_LINES_MAX);
export const commitSizeClass = (lines: number) => classify(lines, COMMIT_LINES_TARGET, COMMIT_LINES_MAX);
export const prLines = (pr: ProposedPR) => pr.commits.reduce((sum, c) => sum + c.added + c.removed, 0);
