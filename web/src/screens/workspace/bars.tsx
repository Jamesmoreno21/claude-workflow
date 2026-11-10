import type { FileEntry } from "../../../../shared/protocol";
import { REPLAY_SPEEDS } from "../../constants/replay";
import type { useReplay } from "../../hooks/useReplay";

export const fileKey = (f: { repo: string; path: string }) => `${f.repo}:${f.path}`;

/** Which architecture layer each task file sits in; the open file's layer is highlighted. */
export function LayerStrip({ layers, files, current }: { layers: string[]; files: FileEntry[]; current: FileEntry }) {
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

/** Play/pause, step and speed controls for the typing replay. */
export function ReplayBar({ replay }: { replay: ReturnType<typeof useReplay> }) {
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
