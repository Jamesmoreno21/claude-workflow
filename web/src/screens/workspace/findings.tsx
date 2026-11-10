import { useState } from "react";
import type { Finding } from "../../../../shared/protocol";
import { useApp } from "../../app/AppContext";
import { Markdown } from "../../components/Markdown";
import { SEVERITY_ORDER } from "../../constants/labels";

export const findingLabel = (f: Finding) => `finding #${f.id}`;

export const sortBySeverity = (findings: Finding[]) =>
  [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id - b.id);

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

/** A GitHub-style review comment, shown between the editor's lines under the line it's about. */
export function FindingBox({ finding, selected, onSelect }: { finding: Finding; selected: boolean; onSelect(): void }) {
  return (
    <div className={`finding-box sev-${finding.severity} ${finding.status} ${selected ? "sel" : ""}`} onClick={onSelect}>
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
      {finding.status === "fixing" && finding.fix?.ready && <div className="fb-fixing">The proposed fix is shown in the editor above.</div>}
      {finding.status === "fixed" && <div className="fb-done">✓ Fixed</div>}
      {finding.status === "dismissed" && <div className="fb-done muted">Dismissed</div>}
    </div>
  );
}

/** Above the editor while it shows a proposed fix: approve it, or say what to change. */
export function FixBanner({ finding }: { finding: Finding }) {
  const { send } = useApp();
  const [note, setNote] = useState("");
  return (
    <div className="fix-banner">
      <span className="fb-fix-title">Proposed fix for #{finding.id}</span>
      <span className="why-text">{finding.title}</span>
      <input value={note} placeholder="Or say what to change…" onChange={(e) => setNote(e.target.value)} />
      <button className="ghost" disabled={!note.trim()} onClick={() => send({ type: "fix_rejected", id: finding.id, text: note.trim() })}>
        Redo
      </button>
      <button className="primary" onClick={() => send({ type: "fix_approved", id: finding.id })}>
        Approve fix
      </button>
    </div>
  );
}
