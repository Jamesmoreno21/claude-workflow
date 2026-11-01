import { useMemo, useState } from "react";
import type { FileEntry } from "../../../shared/protocol";
import { useApp, useFocus } from "../app/AppContext";
import { CodeView } from "../components/CodeView";
import { usePreference } from "../config/settings";
import { FILE_STATUS_ICON } from "../constants/labels";
import { FOLD_CONTEXT, REPLAY_SPEEDS } from "../constants/replay";
import { useHotkeys } from "../hooks/useHotkeys";
import { useReplay } from "../hooks/useReplay";
import { buildRows } from "../lib/diff";

const fileKey = (f: FileEntry) => `${f.repo}:${f.path}`;
const fileName = (f: FileEntry) => f.path.split("/").pop();

/**
 * Follows the file Claude is on, unless the user picked another one while
 * Claude stayed on the same file and revision.
 */
function useSelectedFile(files: FileEntry[]) {
  const active = files.find((f) => f.status === "awaiting_approval") ?? files.find((f) => f.status === "writing");
  const activeKey = active && `${fileKey(active)}#${active.revision}`;
  const [picked, setPicked] = useState<{ key: string; whileActive?: string } | null>(null);
  const selectedKey = picked && (picked.whileActive === activeKey || !active) ? picked.key : active && fileKey(active);
  const file = files.find((f) => fileKey(f) === selectedKey) ?? files.at(-1);
  const select = (f: FileEntry | undefined) => f && setPicked({ key: fileKey(f), whileActive: activeKey });
  return { file, select };
}

function LayerStrip({ layers, files, current }: { layers: string[]; files: FileEntry[]; current: FileEntry }) {
  return (
    <div className="layers">
      {layers.map((layer, i) => {
        const inLayer = files.filter((f) => f.layer === layer);
        return (
          <div key={layer} className={`layer ${current.layer === layer ? "on" : ""} ${inLayer.length ? "" : "empty"}`}>
            <span className="layer-name">{layer}</span>
            <span className="layer-files">
              {inLayer.map((f) => (
                <span key={fileKey(f)} className={`pip ${f.status} ${f === current ? "me" : ""}`} title={f.path} />
              ))}
            </span>
            {i < layers.length - 1 && <span className="layer-arrow">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function ReplayBar({ replay }: { replay: ReturnType<typeof useReplay> }) {
  return (
    <div className="replay">
      <button className="ghost sm" onClick={() => replay.back()} title="Back one line (←, ⇧← for a hunk)">
        ←
      </button>
      <button className="ghost sm play-btn" onClick={replay.toggle} title="Play / pause (P)">
        {replay.playing ? "❚❚" : replay.done ? "↺" : "▶"}
      </button>
      <button className="ghost sm" onClick={() => replay.forward()} title="Forward one line (→, ⇧→ for a hunk)">
        →
      </button>
      <div className="replay-bar">
        <div style={{ width: `${(replay.pos / Math.max(replay.total, 1)) * 100}%` }} />
      </div>
      <span className="muted replay-count">
        line {replay.progress.line}/{replay.progress.lines}
      </span>
      <div className="speeds">
        {REPLAY_SPEEDS.map((speed) => (
          <button key={speed} className={replay.speed === speed ? "on" : ""} onClick={() => replay.setSpeed(speed)}>
            {speed}×
          </button>
        ))}
      </div>
      {!replay.done && (
        <button className="ghost sm" onClick={replay.skip}>
          Skip <kbd>Esc</kbd>
        </button>
      )}
    </div>
  );
}

/**
 * Each file's diff types itself out; the user approves it before the next one.
 * Keys: ←/→ step a line (⇧ a hunk), P play/pause, Esc skip, [ ] switch file,
 * L layers, ⌘⏎ approve.
 */
export function CodingScreen() {
  const { state, send } = useApp();
  const files = state.files;
  const { file, select } = useSelectedFile(files);
  const [feedback, setFeedback] = useState("");
  const [showLayers, setShowLayers] = usePreference("showLayers");

  const before = file?.before;
  const after = file?.after;
  const rows = useMemo(() => (after === undefined ? [] : buildRows(before ?? "", after, FOLD_CONTEXT.file)), [before, after]);
  const replay = useReplay(rows, file ? `${fileKey(file)}#${file.revision}` : "", file?.status === "awaiting_approval");
  useFocus(file && `file:${file.repo}/${file.path}`, file && fileName(file));

  const slide = state.plan?.slides.find((s) => s.id === file?.planRef);
  const layers = state.plan?.layers?.length ? state.plan.layers : [...new Set(files.map((f) => f.layer).filter((l) => l !== undefined))];
  const index = file ? files.indexOf(file) : -1;
  const canApprove = file?.status === "awaiting_approval" && replay.done && state.claudeWaiting;
  const approve = () => file && send({ type: "file_approved", repo: file.repo, path: file.path });

  useHotkeys((e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      if (canApprove) approve();
    } else if (e.key === "ArrowRight") replay.forward(e.shiftKey);
    else if (e.key === "ArrowLeft") replay.back(e.shiftKey);
    else if (e.key.toLowerCase() === "p" && !e.metaKey && !e.ctrlKey) replay.toggle();
    else if (e.key === "Escape") replay.skip();
    else if (e.key === "[") select(files[index - 1]);
    else if (e.key === "]") select(files[index + 1]);
    else if (e.key.toLowerCase() === "l") setShowLayers(!showLayers);
    else return false;
  });

  const reposWithFiles = state.context.repos.filter((r) => files.some((f) => f.repo === r.name));
  const approvedCount = files.filter((f) => f.status === "approved").length;
  const hasDiff = file?.after !== undefined;

  return (
    <div className="coding">
      <nav className="tree">
        <div className="tree-head">
          Files{" "}
          <span className="muted">
            {approvedCount}/{files.length}
          </span>
        </div>
        {reposWithFiles.map((repo) => (
          <div key={repo.name}>
            <div className="tree-repo">{repo.name}</div>
            {files
              .filter((f) => f.repo === repo.name)
              .map((f) => (
                <button key={fileKey(f)} className={`tree-file ${f.status} ${f === file ? "on" : ""}`} onClick={() => select(f)}>
                  <span className="st">{FILE_STATUS_ICON[f.status]}</span>
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
            <button key={fileKey(f)} className={`tab ${f === file ? "on" : ""}`} onClick={() => select(f)}>
              <span className={`st ${f.status}`}>{FILE_STATUS_ICON[f.status]}</span>
              {fileName(f)}
            </button>
          ))}
        </div>

        {file && (
          <div className="why">
            {slide && <span className="plan-ref">Plan · {slide.title}</span>}
            <span className="why-text">{file.intent ?? file.path}</span>
            {layers.length > 0 && (
              <button
                className={`layers-toggle ${showLayers ? "on" : ""}`}
                onClick={() => setShowLayers(!showLayers)}
                title="Show architecture layers (L)"
              >
                ☰ Layers <kbd>L</kbd>
              </button>
            )}
          </div>
        )}
        {file && showLayers && layers.length > 0 && <LayerStrip layers={layers} files={files} current={file} />}

        <div className="code-scroll">
          {!file ? (
            <div className="writing">Claude is choosing the first file…</div>
          ) : !hasDiff || file.status === "writing" ? (
            <div className="writing">
              <span className="spinner" /> Claude is writing <code>{file.path}</code>
            </div>
          ) : (
            <CodeView rows={rows} path={file.path} revealPos={replay.pos} />
          )}
        </div>

        {hasDiff && replay.total > 0 && <ReplayBar replay={replay} />}

        {file && hasDiff && (
          <footer className="file-foot">
            <button className="ghost" disabled={index <= 0} onClick={() => select(files[index - 1])} title="Previous file ([)">
              ‹ <kbd>[</kbd>
            </button>
            <button className="ghost" disabled={index >= files.length - 1} onClick={() => select(files[index + 1])} title="Next file (])">
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
              <button
                className="primary"
                disabled={!canApprove}
                onClick={approve}
                title={replay.done ? "" : "Finish or skip the replay first"}
              >
                Approve file <kbd>⌘⏎</kbd>
              </button>
            )}
          </footer>
        )}
      </section>
    </div>
  );
}
