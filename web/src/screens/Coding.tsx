import { useEffect, useMemo, useState } from "react";
import type { FileEntry } from "../../../shared/protocol";
import { buildRows, CodeView, useReplay } from "../components/CodeView";
import { useApp } from "../connection";

const key = (f: FileEntry) => `${f.repo}:${f.path}`;
const ICON: Record<FileEntry["status"], string> = { pending: "○", writing: "◐", awaiting_approval: "●", approved: "✓" };

export function Coding() {
  const { state, send, setFocus } = useApp();
  const files = state.files;
  const active = files.find((f) => f.status === "awaiting_approval") ?? files.find((f) => f.status === "writing");
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  // Follow Claude to whatever file it is on now.
  useEffect(() => {
    if (active) setSelected(key(active));
  }, [active && key(active), active?.revision]);

  const file = files.find((f) => key(f) === selected) ?? active ?? files.at(-1);
  const rows = useMemo(() => (file?.after !== undefined ? buildRows(file.before ?? "", file.after) : []), [file?.before, file?.after]);
  const replay = useReplay(rows, `${file && key(file)}#${file?.revision}`, file?.status === "awaiting_approval");
  const slide = state.plan?.slides.find((s) => s.id === file?.planRef);

  useEffect(() => {
    if (file) setFocus({ about: `file:${file.repo}/${file.path}`, label: file.path.split("/").pop() });
  }, [file && key(file)]);

  const idx = file ? files.indexOf(file) : -1;
  const approve = () => file && send({ type: "file_approved", repo: file.repo, path: file.path });
  const canApprove = file?.status === "awaiting_approval" && replay.done && state.claudeWaiting;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canApprove) approve();
      else if (e.key === "ArrowLeft" && idx > 0) setSelected(key(files[idx - 1]));
      else if (e.key === "ArrowRight" && idx < files.length - 1) setSelected(key(files[idx + 1]));
      else if (e.key === "Escape") replay.skip();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const byRepo = state.context.repos.filter((r) => files.some((f) => f.repo === r.name));
  const approved = files.filter((f) => f.status === "approved").length;

  return (
    <div className="coding">
      <nav className="tree">
        <div className="tree-head">
          Files <span className="muted">{approved}/{files.length}</span>
        </div>
        {byRepo.map((r) => (
          <div key={r.name}>
            <div className="tree-repo">{r.name}</div>
            {files
              .filter((f) => f.repo === r.name)
              .map((f) => (
                <button key={key(f)} className={`tree-file ${f.status} ${file && key(f) === key(file) ? "on" : ""}`} onClick={() => setSelected(key(f))}>
                  <span className="st">{ICON[f.status]}</span>
                  <span className="nm">{f.path}</span>
                </button>
              ))}
          </div>
        ))}
      </nav>

      <section className="editor">
        <div className="tabs">
          {files.map((f) => (
            <button key={key(f)} className={`tab ${file && key(f) === key(file) ? "on" : ""}`} onClick={() => setSelected(key(f))}>
              <span className={`st ${f.status}`}>{ICON[f.status]}</span>
              {f.path.split("/").pop()}
            </button>
          ))}
        </div>

        {file && (
          <div className="why">
            {slide && <span className="plan-ref">Plan · {slide.title}</span>}
            <span>{file.intent ?? file.path}</span>
          </div>
        )}

        <div className="code-scroll">
          {!file ? (
            <div className="writing">Claude is choosing the first file…</div>
          ) : file.status === "writing" || file.after === undefined ? (
            <div className="writing">
              <span className="spinner" /> Claude is writing <code>{file.path}</code>
            </div>
          ) : (
            <CodeView rows={rows} path={file.path} revealAdds={file.status === "awaiting_approval" ? replay.shown : Infinity} />
          )}
        </div>

        {file && file.after !== undefined && (
          <footer className="file-foot">
            <button className="ghost" disabled={idx <= 0} onClick={() => setSelected(key(files[idx - 1]))}>
              ←
            </button>
            <button className="ghost" disabled={idx >= files.length - 1} onClick={() => setSelected(key(files[idx + 1]))}>
              →
            </button>
            <input
              value={feedback}
              placeholder={file.status === "approved" ? "Reopen with a change…" : "Request a change to this file…"}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && feedback.trim()) {
                  send({ type: "file_feedback", repo: file.repo, path: file.path, text: feedback.trim() });
                  setFeedback("");
                }
              }}
            />
            {!replay.done && file.status === "awaiting_approval" ? (
              <button className="ghost" onClick={replay.skip}>
                Skip replay <kbd>Esc</kbd>
              </button>
            ) : file.status === "approved" ? (
              <span className="ok-badge">✓ Approved</span>
            ) : (
              <button className="primary" disabled={!canApprove} onClick={approve}>
                Approve file <kbd>⌘⏎</kbd>
              </button>
            )}
          </footer>
        )}
      </section>
    </div>
  );
}
