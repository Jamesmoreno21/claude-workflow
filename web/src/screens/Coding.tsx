import { useEffect, useMemo, useState } from "react";
import type { FileEntry } from "../../../shared/protocol";
import { buildRows, CodeView, SPEEDS, useReplay } from "../components/CodeView";
import { useApp } from "../connection";

const key = (f: FileEntry) => `${f.repo}:${f.path}`;
const ICON: Record<FileEntry["status"], string> = { pending: "○", writing: "◐", awaiting_approval: "●", approved: "✓" };

const readFlag = (name: string) => {
  try {
    return localStorage.getItem(name) === "1";
  } catch {
    return false;
  }
};

/**
 * Keys: ←/→ step one line, ⇧←/⇧→ one hunk, P play/pause, Esc skip,
 * [ / ] previous/next file, L layers, ⌘⏎ approve.
 */
export function Coding() {
  const { state, send, setFocus } = useApp();
  const files = state.files;
  const active = files.find((f) => f.status === "awaiting_approval") ?? files.find((f) => f.status === "writing");
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showLayers, setShowLayers] = useState(() => readFlag("wf.layers"));

  // Follow Claude to whatever file it is on now.
  useEffect(() => {
    if (active) setSelected(key(active));
  }, [active && key(active), active?.revision]);

  const file = files.find((f) => key(f) === selected) ?? active ?? files.at(-1);
  const rows = useMemo(() => (file?.after !== undefined ? buildRows(file.before ?? "", file.after) : []), [file?.before, file?.after]);
  const replay = useReplay(rows, `${file && key(file)}#${file?.revision}`, file?.status === "awaiting_approval");
  const slide = state.plan?.slides.find((s) => s.id === file?.planRef);

  const layers = state.plan?.layers?.length ? state.plan.layers : [...new Set(files.map((f) => f.layer).filter(Boolean) as string[])];

  useEffect(() => {
    if (file) setFocus({ about: `file:${file.repo}/${file.path}`, label: file.path.split("/").pop() });
  }, [file && key(file)]);

  const idx = file ? files.indexOf(file) : -1;
  const approve = () => file && send({ type: "file_approved", repo: file.repo, path: file.path });
  const canApprove = file?.status === "awaiting_approval" && replay.done && state.claudeWaiting;
  const toggleLayers = () => {
    setShowLayers(!showLayers);
    try {
      localStorage.setItem("wf.layers", showLayers ? "0" : "1");
    } catch {}
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el?.tagName === "TEXTAREA" || el?.tagName === "INPUT") return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canApprove) approve();
      else if (e.key === "ArrowRight") replay.forward(e.shiftKey);
      else if (e.key === "ArrowLeft") replay.back(e.shiftKey);
      else if (e.key.toLowerCase() === "p") replay.toggle();
      else if (e.key === "Escape") replay.skip();
      else if (e.key === "[" && idx > 0) setSelected(key(files[idx - 1]));
      else if (e.key === "]" && idx < files.length - 1) setSelected(key(files[idx + 1]));
      else if (e.key.toLowerCase() === "l") toggleLayers();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const byRepo = state.context.repos.filter((r) => files.some((f) => f.repo === r.name));
  const approved = files.filter((f) => f.status === "approved").length;
  const showReplay = file?.after !== undefined && replay.total > 0;

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
                  {showLayers && f.layer && <span className="layer-tag">{f.layer}</span>}
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
            <span className="why-text">{file.intent ?? file.path}</span>
            {layers.length > 0 && (
              <button className={`layers-toggle ${showLayers ? "on" : ""}`} onClick={toggleLayers} title="Show architecture layers (L)">
                ☰ Layers <kbd>L</kbd>
              </button>
            )}
          </div>
        )}

        {file && showLayers && layers.length > 0 && (
          <div className="layers">
            {layers.map((l, i) => {
              const inLayer = files.filter((f) => f.layer === l);
              return (
                <div key={l} className={`layer ${file.layer === l ? "on" : ""} ${inLayer.length ? "" : "empty"}`}>
                  <span className="layer-name">{l}</span>
                  <span className="layer-files">
                    {inLayer.map((f) => (
                      <span key={key(f)} className={`pip ${f.status} ${key(f) === key(file) ? "me" : ""}`} title={f.path} />
                    ))}
                  </span>
                  {i < layers.length - 1 && <span className="layer-arrow">→</span>}
                </div>
              );
            })}
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
            <CodeView rows={rows} path={file.path} revealPos={replay.pos} />
          )}
        </div>

        {showReplay && (
          <div className="replay">
            <button className="ghost sm" onClick={() => replay.back(false)} title="Back one line (←, ⇧← for a hunk)">
              ←
            </button>
            <button className="ghost sm play-btn" onClick={replay.toggle} title="Play / pause (P)">
              {replay.playing ? "❚❚" : replay.done ? "↺" : "▶"}
            </button>
            <button className="ghost sm" onClick={() => replay.forward(false)} title="Forward one line (→, ⇧→ for a hunk)">
              →
            </button>
            <div className="replay-bar">
              <div style={{ width: `${(replay.pos / Math.max(replay.total, 1)) * 100}%` }} />
            </div>
            <span className="muted replay-count">
              line {replay.progress.line}/{replay.progress.lines}
            </span>
            <div className="speeds">
              {SPEEDS.map((s) => (
                <button key={s} className={replay.speed === s ? "on" : ""} onClick={() => replay.setSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
            {!replay.done && (
              <button className="ghost sm" onClick={replay.skip}>
                Skip <kbd>Esc</kbd>
              </button>
            )}
          </div>
        )}

        {file && file.after !== undefined && (
          <footer className="file-foot">
            <button className="ghost" disabled={idx <= 0} onClick={() => setSelected(key(files[idx - 1]))} title="Previous file ([)">
              ‹ <kbd>[</kbd>
            </button>
            <button className="ghost" disabled={idx >= files.length - 1} onClick={() => setSelected(key(files[idx + 1]))} title="Next file (])">
              <kbd>]</kbd> ›
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
                if (e.key === "Escape") (e.target as HTMLElement).blur();
              }}
            />
            {file.status === "approved" ? (
              <span className="ok-badge">✓ Approved</span>
            ) : (
              <button className="primary" disabled={!canApprove} onClick={approve} title={replay.done ? "" : "Finish or skip the replay first"}>
                Approve file <kbd>⌘⏎</kbd>
              </button>
            )}
          </footer>
        )}
      </section>
    </div>
  );
}
