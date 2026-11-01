import { diffLines } from "diff";
import hljs from "highlight.js/lib/common";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface Row {
  kind: "ctx" | "add" | "del" | "fold";
  text: string;
  /** Line number in the new file (undefined for deleted lines). */
  newNo?: number;
  oldNo?: number;
  /** For folds: how many lines are hidden. */
  hidden?: number;
}

const LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift",
  css: "css", scss: "scss", html: "xml", vue: "xml", json: "json", md: "markdown", yml: "yaml",
  yaml: "yaml", sh: "bash", sql: "sql", php: "php", cs: "csharp",
};

export const langOf = (path: string) => LANG[path.split(".").pop() ?? ""] ?? "plaintext";

/** Line diff, with long unchanged stretches folded like GitHub does. */
export function buildRows(before: string, after: string, foldContext = 4, keepLines: number[] = []): Row[] {
  const rows: Row[] = [];
  let o = 1;
  let n = 1;
  for (const part of diffLines(before ?? "", after ?? "")) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const text of lines) {
      if (part.added) rows.push({ kind: "add", text, newNo: n++ });
      else if (part.removed) rows.push({ kind: "del", text, oldNo: o++ });
      else rows.push({ kind: "ctx", text, newNo: n++, oldNo: o++ });
    }
  }
  if (!before) return rows; // new file: show everything
  const near = rows.map(() => false);
  const keep = new Set(keepLines);
  rows.forEach((r, i) => {
    if (r.kind === "ctx" && !keep.has(r.newNo!)) return;
    for (let j = Math.max(0, i - foldContext); j <= Math.min(rows.length - 1, i + foldContext); j++) near[j] = true;
  });
  const out: Row[] = [];
  for (let i = 0; i < rows.length; ) {
    if (near[i]) out.push(rows[i++]);
    else {
      let j = i;
      while (j < rows.length && !near[j]) j++;
      out.push({ kind: "fold", text: "", hidden: j - i });
      i = j;
    }
  }
  return out;
}

function highlight(text: string, lang: string) {
  try {
    return hljs.highlight(text || " ", { language: lang, ignoreIllegals: true }).value;
  } catch {
    return text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  }
}

/**
 * Replays added lines one at a time so the user follows the change instead of
 * receiving a wall of code. `animateKey` changing restarts the replay.
 */
export function useReplay(rows: Row[], animateKey: string | number, enabled: boolean) {
  const total = rows.filter((r) => r.kind === "add").length;
  const [shown, setShown] = useState(enabled ? 0 : total);
  useEffect(() => {
    if (!enabled) return setShown(total);
    setShown(0);
    // Long files replay faster so nothing takes more than ~12s.
    const step = Math.max(12, Math.min(90, 12000 / Math.max(total, 1)));
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= total) clearInterval(t);
    }, step);
    return () => clearInterval(t);
  }, [animateKey, enabled, total]);
  return { shown, total, done: shown >= total, skip: () => setShown(total) };
}

export function CodeView({
  rows,
  path,
  revealAdds = Infinity,
  annotations,
  highlightLine,
}: {
  rows: Row[];
  path: string;
  revealAdds?: number;
  /** Boxes rendered under a given new-file line number. */
  annotations?: Map<number, ReactNode>;
  highlightLine?: number;
}) {
  const lang = langOf(path);
  const cursorRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => rows.map((r) => (r.kind === "fold" ? "" : highlight(r.text, lang))), [rows, lang]);

  let adds = 0;
  let cursorIndex = -1;
  const visible: boolean[] = rows.map((r, i) => {
    if (r.kind !== "add") return true;
    adds += 1;
    if (adds <= revealAdds) {
      cursorIndex = i;
      return true;
    }
    return false;
  });
  const typing = revealAdds !== Infinity && adds > revealAdds;

  useEffect(() => {
    if (typing) cursorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cursorIndex, typing]);

  useEffect(() => {
    if (highlightLine) document.getElementById(`L${highlightLine}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightLine]);

  return (
    <div className="code">
      {rows.map((r, i) => {
        if (!visible[i]) return null;
        if (r.kind === "fold")
          return (
            <div key={i} className="row fold">
              <span className="gutter" />
              <span className="gutter" />
              <span className="text">⋯ {r.hidden} unchanged lines</span>
            </div>
          );
        const isCursor = typing && i === cursorIndex;
        return (
          <Fragment key={i}>
            <div
              id={r.newNo ? `L${r.newNo}` : undefined}
              ref={isCursor ? cursorRef : undefined}
              className={`row ${r.kind} ${isCursor ? "cursor" : ""} ${highlightLine && r.newNo === highlightLine ? "hl" : ""}`}
            >
              <span className="gutter">{r.oldNo ?? ""}</span>
              <span className="gutter">{r.newNo ?? ""}</span>
              <span className="sign">{r.kind === "add" ? "+" : r.kind === "del" ? "−" : ""}</span>
              <span className="text" dangerouslySetInnerHTML={{ __html: html[i] }} />
            </div>
            {r.newNo !== undefined && r.kind !== "del" && annotations?.get(r.newNo)}
          </Fragment>
        );
      })}
    </div>
  );
}
