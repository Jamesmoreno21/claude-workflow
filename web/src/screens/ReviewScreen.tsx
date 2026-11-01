import { useMemo, useState } from "react";
import { isUnresolved, type Finding } from "../../../shared/protocol";
import { useApp, useFocus } from "../app/AppContext";
import { CodeView } from "../components/CodeView";
import { Markdown } from "../components/Markdown";
import { FINDING_STATUS_ICON, SEVERITY_ORDER } from "../constants/labels";
import { FOLD_CONTEXT } from "../constants/replay";
import { buildRows } from "../lib/diff";

const findingLabel = (f: Finding) => `finding #${f.id}`;

function FindingActions({ finding }: { finding: Finding }) {
  const { state, send, setFocus } = useApp();
  const ask = () => {
    setFocus({ about: `finding:${finding.id}`, label: findingLabel(finding) });
    document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
  };
  return (
    <div className="fb-actions">
      <button className="primary" disabled={!state.claudeWaiting} onClick={() => send({ type: "finding_fix", id: finding.id })}>
        Fix
      </button>
      <button className="ghost" onClick={() => send({ type: "finding_dismiss", id: finding.id })}>
        Dismiss
      </button>
      <button className="ghost" onClick={ask}>
        Ask
      </button>
    </div>
  );
}

function ProposedFix({ finding }: { finding: Finding }) {
  const { send } = useApp();
  const [note, setNote] = useState("");
  const fix = finding.fix!;
  const rows = useMemo(() => buildRows(fix.before, fix.after, FOLD_CONTEXT.fix), [fix.before, fix.after]);
  return (
    <div className="fb-fix">
      <div className="fb-fix-title">Proposed fix</div>
      <CodeView rows={rows} path={finding.path} />
      <div className="fb-actions">
        <button className="primary" onClick={() => send({ type: "fix_approved", id: finding.id })}>
          Approve fix
        </button>
        <input value={note} placeholder="Or say what to change…" onChange={(e) => setNote(e.target.value)} />
        <button className="ghost" disabled={!note.trim()} onClick={() => send({ type: "fix_rejected", id: finding.id, text: note.trim() })}>
          Redo
        </button>
      </div>
    </div>
  );
}

/** A GitHub-style review comment, rendered under the line it's about. */
function FindingBox({ finding, selected }: { finding: Finding; selected: boolean }) {
  return (
    <div className={`finding-box sev-${finding.severity} ${finding.status} ${selected ? "sel" : ""}`}>
      <div className="fb-head">
        <span className={`num sev-${finding.severity}`}>{finding.id}</span>
        <b>{finding.title}</b>
        <span className="tags">
          <em>{finding.severity}</em>
          <em>{finding.category}</em>
          {finding.source && <em>{finding.source}</em>}
        </span>
      </div>
      <Markdown text={finding.body} />
      {finding.suggestion && <Markdown className="suggestion" text={`**Suggested:** ${finding.suggestion}`} />}

      {finding.status === "open" && <FindingActions finding={finding} />}
      {finding.status === "fixing" && !finding.fix?.ready && (
        <div className="fb-fixing">
          <span className="spinner" /> Claude is fixing this…
        </div>
      )}
      {finding.status === "fixing" && finding.fix?.ready && <ProposedFix finding={finding} />}
      {finding.status === "fixed" && <div className="fb-done">✓ Fixed</div>}
      {finding.status === "dismissed" && <div className="fb-done muted">Dismissed</div>}
    </div>
  );
}

const sortBySeverity = (findings: Finding[]) =>
  [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id - b.id);

/** Numbered findings from the reviewer agents, shown inline in the code. */
export function ReviewScreen() {
  const { state } = useApp();
  const [showDismissed, setShowDismissed] = useState(false);
  const visible = sortBySeverity(state.findings.filter((f) => showDismissed || f.status !== "dismissed"));
  // Start on the most severe finding; stay on it after it's fixed so the result shows.
  const [selectedId, setSelectedId] = useState(() => visible[0]?.id);

  const unresolved = state.findings.filter(isUnresolved);
  // A dismissed (hidden) selection moves on to the next unresolved finding.
  const selected = visible.find((f) => f.id === selectedId) ?? visible.find(isUnresolved) ?? visible[0];
  useFocus(selected && `finding:${selected.id}`, selected && findingLabel(selected));

  const file = state.files.find((f) => f.repo === selected?.repo && f.path === selected?.path);
  const inFile = visible.filter((f) => f.repo === file?.repo && f.path === file?.path);
  const rows =
    file?.after === undefined
      ? []
      : buildRows(
          file.before ?? "",
          file.after,
          FOLD_CONTEXT.review,
          inFile.map((f) => f.line),
        );
  const annotations = new Map(inFile.map((f) => [f.line, <FindingBox key={f.id} finding={f} selected={f === selected} />]));

  const count = (status: Finding["status"]) => state.findings.filter((f) => f.status === status).length;

  return (
    <div className="review">
      <nav className="findings">
        <div className="tree-head">
          Findings <span className="muted">{unresolved.length} open</span>
        </div>
        {visible.map((f) => (
          <button key={f.id} className={`finding-item ${f.status} ${f === selected ? "on" : ""}`} onClick={() => setSelectedId(f.id)}>
            <span className={`num sev-${f.severity}`}>{f.id}</span>
            <div>
              <b>{f.title}</b>
              <small>
                {f.path.split("/").pop()}:{f.line} · {f.category}
              </small>
            </div>
            <span className="st">{FINDING_STATUS_ICON[f.status]}</span>
          </button>
        ))}
        <label className="toggle">
          <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} /> Show dismissed
        </label>
      </nav>

      <section className="editor">
        {unresolved.length === 0 ? (
          <div className="all-clear">
            <div className="big-check">✓</div>
            <h2>Review clear</h2>
            <p>
              {count("fixed")} fixed · {count("dismissed")} dismissed. Claude is preparing the commit history…
            </p>
          </div>
        ) : file ? (
          <>
            <div className="tabs">
              <span className="tab on">
                {file.repo}/{file.path}
              </span>
            </div>
            <div className="code-scroll">
              <CodeView rows={rows} path={file.path} annotations={annotations} highlightLine={selected?.line} />
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
