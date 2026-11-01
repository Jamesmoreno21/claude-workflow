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

/* ---------- Replay ---------- */

/** Typing speed at 1×, in characters per second: a quick human typist. */
const CPS = 28;
const LINE_PAUSE = 140;
const HUNK_PAUSE = 700;
export const SPEEDS = [0.5, 1, 2, 4];

interface TypedLine {
  row: number;
  start: number;
  len: number;
  indent: number;
  hunkStart: boolean;
}

/** Position of every added line in a single "characters typed" timeline. */
function timeline(rows: Row[]) {
  const lines: TypedLine[] = [];
  let offset = 0;
  let prev = -2;
  rows.forEach((r, i) => {
    if (r.kind !== "add") return;
    lines.push({ row: i, start: offset, len: r.text.length, indent: r.text.match(/^\s*/)![0].length, hunkStart: i !== prev + 1 });
    offset += r.text.length + 1; // +1 for the newline that finishes the line
    prev = i;
  });
  return { lines, total: offset };
}

const lineAt = (lines: TypedLine[], pos: number) => Math.max(0, lines.findLastIndex((l) => l.start <= pos));

const savedSpeed = () => {
  try {
    return Number(localStorage.getItem("wf.speed")) || 1;
  } catch {
    return 1;
  }
};

/**
 * Types the added lines at a human pace so the change can be followed. The
 * position is a character offset into the added lines; stepping pauses playback.
 */
export function useReplay(rows: Row[], animateKey: string | number, enabled: boolean) {
  const { lines, total } = useMemo(() => timeline(rows), [rows]);
  const [pos, setPos] = useState(enabled ? 0 : total);
  const [playing, setPlaying] = useState(enabled);
  const [speed, setSpeedState] = useState(savedSpeed);

  useEffect(() => {
    setPos(enabled ? 0 : total);
    setPlaying(enabled);
  }, [animateKey, enabled, total]);

  useEffect(() => {
    if (!playing) return;
    if (pos >= total) return setPlaying(false);
    const li = lineAt(lines, pos);
    const l = lines[li];
    const col = pos - l.start;
    const char = 1000 / (CPS * speed);
    const hunk = l.hunkStart && li > 0 && col === 0 ? HUNK_PAUSE / speed : 0;
    let next = pos + 1;
    let delay = char;
    if (col >= l.len) delay = (l.len ? LINE_PAUSE : LINE_PAUSE / 2) / speed; // finish the line
    else if (col === 0 && l.indent > 0) {
      next = l.start + l.indent; // editors auto-indent; don't type the spaces
      delay = hunk;
    } else delay = Math.max(char, hunk);
    const t = window.setTimeout(() => setPos(Math.min(next, total)), delay);
    return () => clearTimeout(t);
  }, [playing, pos, speed, lines, total]);

  const current = lineAt(lines, Math.min(pos, total - 1));
  const typedLines = lines.filter((l) => pos >= l.start + l.len + 1).length;

  const forward = (hunk = false) => {
    setPlaying(false);
    if (!lines.length) return;
    if (hunk) {
      const nextHunk = lines.findIndex((l, i) => i > current && l.hunkStart);
      return setPos(nextHunk < 0 ? total : lines[nextHunk].start);
    }
    const l = lines[lineAt(lines, pos)];
    setPos(Math.min(total, pos >= l.start + l.len + 1 ? pos : l.start + l.len + 1));
  };

  const back = (hunk = false) => {
    setPlaying(false);
    if (!lines.length || pos === 0) return;
    if (hunk) {
      let i = lineAt(lines, pos - 1);
      while (i > 0 && !lines[i].hunkStart) i--;
      return setPos(lines[i].start);
    }
    const li = lineAt(lines, pos);
    setPos(pos > lines[li].start ? lines[li].start : lines[Math.max(0, li - 1)].start);
  };

  const setSpeed = (s: number) => {
    setSpeedState(s);
    try {
      localStorage.setItem("wf.speed", String(s));
    } catch {}
  };

  return {
    pos,
    total,
    done: pos >= total,
    playing,
    speed,
    progress: { line: typedLines, lines: lines.length },
    toggle: () => (pos >= total ? (setPos(0), setPlaying(true)) : setPlaying(!playing)),
    forward,
    back,
    skip: () => {
      setPlaying(false);
      setPos(total);
    },
    setSpeed,
  };
}

export function CodeView({
  rows,
  path,
  revealPos = Infinity,
  annotations,
  highlightLine,
}: {
  rows: Row[];
  path: string;
  /** Characters of added lines typed so far (see useReplay). */
  revealPos?: number;
  /** Boxes rendered under a given new-file line number. */
  annotations?: Map<number, ReactNode>;
  highlightLine?: number;
}) {
  const lang = langOf(path);
  const cursorRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => rows.map((r) => (r.kind === "fold" ? "" : highlight(r.text, lang))), [rows, lang]);
  const { lines } = useMemo(() => timeline(rows), [rows]);
  const byRow = useMemo(() => new Map(lines.map((l) => [l.row, l])), [lines]);

  const cursorRow = revealPos === Infinity ? -1 : (lines.find((l) => revealPos >= l.start && revealPos < l.start + l.len + 1)?.row ?? -1);

  useEffect(() => {
    if (cursorRow >= 0) cursorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cursorRow]);

  useEffect(() => {
    if (highlightLine) document.getElementById(`L${highlightLine}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightLine]);

  return (
    <div className="code">
      {rows.map((r, i) => {
        const typed = byRow.get(i);
        if (typed && revealPos < typed.start) return null; // not reached yet
        if (r.kind === "fold")
          return (
            <div key={i} className="row fold">
              <span className="gutter" />
              <span className="gutter" />
              <span className="text">⋯ {r.hidden} unchanged lines</span>
            </div>
          );
        const isCursor = i === cursorRow;
        const text = isCursor && typed ? highlight(r.text.slice(0, revealPos - typed.start), lang) : html[i];
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
              <span className="text" dangerouslySetInnerHTML={{ __html: text }} />
            </div>
            {r.newNo !== undefined && r.kind !== "del" && annotations?.get(r.newNo)}
          </Fragment>
        );
      })}
    </div>
  );
}
