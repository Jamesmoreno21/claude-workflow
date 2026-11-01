import { diffLines } from "diff";
import hljs from "highlight.js/lib/common";

export interface Row {
  kind: "ctx" | "add" | "del" | "fold";
  text: string;
  /** Line number in the new file (none for deleted lines). */
  newNo?: number;
  oldNo?: number;
  /** For folds: how many lines are hidden. */
  hidden?: number;
}

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  css: "css",
  scss: "scss",
  html: "xml",
  vue: "xml",
  json: "json",
  md: "markdown",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  sql: "sql",
  php: "php",
  cs: "csharp",
};

export const langOf = (path: string) => EXT_TO_LANG[path.split(".").pop() ?? ""] ?? "plaintext";

/**
 * Line diff with long unchanged stretches folded, like GitHub. `keepLines`
 * (new-file line numbers) stay visible so findings always have an anchor.
 */
export function buildRows(before: string, after: string, foldContext = 4, keepLines: number[] = []): Row[] {
  const rows: Row[] = [];
  let oldNo = 1;
  let newNo = 1;
  for (const part of diffLines(before ?? "", after ?? "")) {
    for (const text of part.value.replace(/\n$/, "").split("\n")) {
      if (part.added) rows.push({ kind: "add", text, newNo: newNo++ });
      else if (part.removed) rows.push({ kind: "del", text, oldNo: oldNo++ });
      else rows.push({ kind: "ctx", text, newNo: newNo++, oldNo: oldNo++ });
    }
  }
  if (!before) return rows; // a new file is all additions; nothing to fold

  const keep = new Set(keepLines);
  const visible = rows.map(() => false);
  rows.forEach((row, i) => {
    if (row.kind === "ctx" && !keep.has(row.newNo!)) return;
    for (let j = Math.max(0, i - foldContext); j <= Math.min(rows.length - 1, i + foldContext); j++) visible[j] = true;
  });

  const folded: Row[] = [];
  for (let i = 0; i < rows.length;) {
    if (visible[i]) {
      folded.push(rows[i++]);
      continue;
    }
    const start = i;
    while (i < rows.length && !visible[i]) i++;
    folded.push({ kind: "fold", text: "", hidden: i - start });
  }
  return folded;
}

const escapeHtml = (text: string) => text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** Syntax-highlighted HTML for one line (escaped, so safe to inject). */
export function highlight(text: string, lang: string) {
  try {
    return hljs.highlight(text || " ", { language: lang, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(text);
  }
}

export interface TypedLine {
  /** Index into the rows. */
  row: number;
  /** Offset of the line's first character in the typing timeline. */
  start: number;
  length: number;
  indent: number;
  /** First line of a group of consecutive additions. */
  hunkStart: boolean;
}

/** Every added line placed on one "characters typed" timeline (+1 per newline). */
export function typingTimeline(rows: Row[]) {
  const lines: TypedLine[] = [];
  let offset = 0;
  let previousRow = -2;
  rows.forEach((row, i) => {
    if (row.kind !== "add") return;
    const indent = row.text.match(/^\s*/)![0].length;
    lines.push({ row: i, start: offset, length: row.text.length, indent, hunkStart: i !== previousRow + 1 });
    offset += row.text.length + 1;
    previousRow = i;
  });
  return { lines, total: offset };
}

/** Index of the line that contains timeline position `pos`. */
export const lineAt = (lines: TypedLine[], pos: number) =>
  Math.max(
    0,
    lines.findLastIndex((l) => l.start <= pos),
  );
