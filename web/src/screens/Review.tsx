import { useEffect, useMemo, useState } from "react";
import type { Finding } from "../../../shared/protocol";
import { buildRows, CodeView } from "../components/CodeView";
import { Markdown } from "../components/Markdown";
import { useApp } from "../connection";

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export function Review() {
  const { state } = useApp();
  const [showDismissed, setShowDismissed] = useState(false);
  const visible = state.findings
    .filter((f) => showDismissed || f.status !== "dismissed")
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.id - b.id);
  const open = state.findings.filter((f) => f.status === "open" || f.status === "fixing");
  const [selectedId, setSelectedId] = useState<number | undefined>(visible[0]?.id);
  // When the selected finding is dismissed (and hidden), jump to the next open one.
  const selected =
    visible.find((f) => f.id === selectedId) ?? visible.find((f) => f.status === "open" || f.status === "fixing") ?? visible[0];

  const file = state.files.find((f) => f.repo === selected?.repo && f.path === selected?.path);
  const inFile = visible.filter((f) => f.repo === file?.repo && f.path === file?.path);
  const rows = useMemo(
    () => (file ? buildRows(file.before ?? "", file.after ?? "", 3, inFile.map((f) => f.line)) : []),
    [file?.before, file?.after, inFile.map((f) => f.line).join()],
  );
  const annotations = new Map(inFile.map((f) => [f.line, <FindingBox key={f.id} f={f} selected={f.id === selected?.id} />]));

  return (
    <div className="review">
      <nav className="findings">
        <div className="tree-head">
          Findings <span className="muted">{open.length} open</span>
        </div>
        {visible.map((f) => (
          <button key={f.id} className={`finding-item ${f.status} ${f.id === selected?.id ? "on" : ""}`} onClick={() => setSelectedId(f.id)}>
            <span className={`num sev-${f.severity}`}>{f.id}</span>
            <div>
              <b>{f.title}</b>
              <small>
                {f.path.split("/").pop()}:{f.line} · {f.category}
              </small>
            </div>
            <span className="st">{f.status === "fixed" ? "✓" : f.status === "dismissed" ? "–" : f.status === "fixing" ? "◐" : ""}</span>
          </button>
        ))}
        <label className="toggle">
          <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} /> Show dismissed
        </label>
      </nav>

      <section className="editor">
        {open.length === 0 ? (
          <div className="all-clear">
            <div className="big-check">✓</div>
            <h2>Review clear</h2>
            <p>{state.findings.filter((f) => f.status === "fixed").length} fixed · {state.findings.filter((f) => f.status === "dismissed").length} dismissed. Claude is preparing the commit history…</p>
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

function FindingBox({ f, selected }: { f: Finding; selected: boolean }) {
  const { state, send, setFocus } = useApp();
  const [note, setNote] = useState("");
  const fixRows = useMemo(() => (f.fix?.ready ? buildRows(f.fix.before, f.fix.after, 2) : []), [f.fix?.ready, f.fix?.after]);
  const ask = () => {
    setFocus({ about: `finding:${f.id}`, label: `finding #${f.id}` });
    document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
  };
  useEffect(() => {
    if (selected) setFocus({ about: `finding:${f.id}`, label: `finding #${f.id}` });
  }, [selected]);

  return (
    <div className={`finding-box sev-${f.severity} ${f.status} ${selected ? "sel" : ""}`}>
      <div className="fb-head">
        <span className={`num sev-${f.severity}`}>{f.id}</span>
        <b>{f.title}</b>
        <span className="tags">
          <em>{f.severity}</em>
          <em>{f.category}</em>
          {f.source && <em>{f.source}</em>}
        </span>
      </div>
      <Markdown text={f.body} />
      {f.suggestion && <Markdown className="suggestion" text={`**Suggested:** ${f.suggestion}`} />}

      {f.status === "open" && (
        <div className="fb-actions">
          <button className="primary" disabled={!state.claudeWaiting} onClick={() => send({ type: "finding_fix", id: f.id })}>
            Fix
          </button>
          <button className="ghost" onClick={() => send({ type: "finding_dismiss", id: f.id })}>
            Dismiss
          </button>
          <button className="ghost" onClick={ask}>
            Ask
          </button>
        </div>
      )}

      {f.status === "fixing" && !f.fix?.ready && (
        <div className="fb-fixing">
          <span className="spinner" /> Claude is fixing this…
        </div>
      )}

      {f.status === "fixing" && f.fix?.ready && (
        <div className="fb-fix">
          <div className="fb-fix-title">Proposed fix</div>
          <CodeView rows={fixRows} path={f.path} />
          <div className="fb-actions">
            <button className="primary" onClick={() => send({ type: "fix_approved", id: f.id })}>
              Approve fix
            </button>
            <input value={note} placeholder="Or say what to change…" onChange={(e) => setNote(e.target.value)} />
            <button className="ghost" disabled={!note.trim()} onClick={() => send({ type: "fix_rejected", id: f.id, text: note.trim() })}>
              Redo
            </button>
          </div>
        </div>
      )}

      {f.status === "fixed" && <div className="fb-done">✓ Fixed</div>}
      {f.status === "dismissed" && <div className="fb-done muted">Dismissed</div>}
    </div>
  );
}
