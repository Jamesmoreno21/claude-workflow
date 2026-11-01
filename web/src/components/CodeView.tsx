import { Fragment, useEffect, useMemo, useRef, type ReactNode } from "react";
import { highlight, langOf, typingTimeline, type Row } from "../lib/diff";

/**
 * A diff with line numbers. `revealPos` (from useReplay) hides added text
 * not typed yet; `annotations` render boxes under new-file line numbers.
 */
export function CodeView({
  rows,
  path,
  revealPos = Infinity,
  annotations,
  highlightLine,
}: {
  rows: Row[];
  path: string;
  revealPos?: number;
  annotations?: Map<number, ReactNode>;
  highlightLine?: number;
}) {
  const lang = langOf(path);
  const cursorRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => rows.map((r) => (r.kind === "fold" ? "" : highlight(r.text, lang))), [rows, lang]);
  const typedLines = useMemo(() => new Map(typingTimeline(rows).lines.map((l) => [l.row, l])), [rows]);

  let cursorRow = -1;
  for (const [row, line] of typedLines) {
    if (revealPos >= line.start && revealPos < line.start + line.length + 1) cursorRow = row;
  }

  useEffect(() => {
    if (cursorRow >= 0) cursorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cursorRow]);

  useEffect(() => {
    if (highlightLine) document.getElementById(`L${highlightLine}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightLine]);

  return (
    <div className="code">
      {rows.map((row, i) => {
        const typed = typedLines.get(i);
        if (typed && revealPos < typed.start) return null; // not typed yet
        if (row.kind === "fold")
          return (
            <div key={i} className="row fold">
              <span className="gutter" />
              <span className="gutter" />
              <span className="text">⋯ {row.hidden} unchanged lines</span>
            </div>
          );
        const isCursor = i === cursorRow;
        const text = isCursor && typed ? highlight(row.text.slice(0, revealPos - typed.start), lang) : html[i];
        return (
          <Fragment key={i}>
            <div
              id={row.newNo ? `L${row.newNo}` : undefined}
              ref={isCursor ? cursorRef : undefined}
              className={`row ${row.kind} ${isCursor ? "cursor" : ""} ${highlightLine && row.newNo === highlightLine ? "hl" : ""}`}
            >
              <span className="gutter">{row.oldNo ?? ""}</span>
              <span className="gutter">{row.newNo ?? ""}</span>
              <span className="sign">{row.kind === "add" ? "+" : row.kind === "del" ? "−" : ""}</span>
              <span className="text" dangerouslySetInnerHTML={{ __html: text }} />
            </div>
            {row.newNo !== undefined && row.kind !== "del" && annotations?.get(row.newNo)}
          </Fragment>
        );
      })}
    </div>
  );
}
