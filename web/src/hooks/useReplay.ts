import { useEffect, useMemo, useState } from "react";
import { usePreference } from "../config/settings";
import { HUNK_PAUSE_MS, LINE_PAUSE_MS, TYPING_CPS } from "../constants/replay";
import { lineAt, typingTimeline, type Row } from "../lib/diff";

interface Run {
  key: string;
  enabled: boolean;
  pos: number;
  playing: boolean;
}

/** How long to wait before the next step, and where that step lands. */
function nextStep(lines: ReturnType<typeof typingTimeline>["lines"], pos: number, speed: number) {
  const index = lineAt(lines, pos);
  const line = lines[index];
  const column = pos - line.start;
  const charDelay = 1000 / (TYPING_CPS * speed);
  const hunkDelay = line.hunkStart && index > 0 && column === 0 ? HUNK_PAUSE_MS / speed : 0;

  if (column >= line.length) return { to: pos + 1, delay: (line.length ? LINE_PAUSE_MS : LINE_PAUSE_MS / 2) / speed };
  // Editors auto-indent, so indentation appears at once.
  if (column === 0 && line.indent > 0) return { to: line.start + line.indent, delay: hunkDelay };
  return { to: pos + 1, delay: Math.max(charDelay, hunkDelay) };
}

/**
 * Types a diff's added lines at a human pace so the change can be followed.
 * The position counts characters typed; stepping pauses playback. A new
 * `replayKey` (file + revision) restarts it.
 */
export function useReplay(rows: Row[], replayKey: string, enabled: boolean) {
  const { lines, total } = useMemo(() => typingTimeline(rows), [rows]);
  const [speed, setSpeed] = usePreference("replaySpeed");
  const fresh = (): Run => ({ key: replayKey, enabled, pos: enabled ? 0 : total, playing: enabled });
  const [run, setRun] = useState<Run>(fresh);

  // Restart when the file or revision changes (state reset during render).
  let current = run;
  if (run.key !== replayKey || run.enabled !== enabled) {
    current = fresh();
    setRun(current);
  }
  const pos = Math.min(current.pos, total);
  const playing = current.playing && pos < total;

  useEffect(() => {
    if (!playing) return;
    const { to, delay } = nextStep(lines, pos, speed);
    const timer = window.setTimeout(() => setRun((r) => ({ ...r, pos: Math.min(to, total) })), delay);
    return () => clearTimeout(timer);
  }, [playing, pos, speed, lines, total]);

  const moveTo = (to: number) => setRun((r) => ({ ...r, pos: Math.max(0, Math.min(total, to)), playing: false }));
  const currentIndex = lineAt(lines, Math.min(pos, total - 1));

  const forward = (wholeHunk = false) => {
    if (!lines.length) return;
    if (wholeHunk) {
      const nextHunk = lines.findIndex((l, i) => i > currentIndex && l.hunkStart);
      return moveTo(nextHunk < 0 ? total : lines[nextHunk].start);
    }
    const line = lines[lineAt(lines, pos)];
    moveTo(Math.max(pos, line.start + line.length + 1));
  };

  const back = (wholeHunk = false) => {
    if (!lines.length || pos === 0) return;
    if (wholeHunk) {
      let i = lineAt(lines, pos - 1);
      while (i > 0 && !lines[i].hunkStart) i--;
      return moveTo(lines[i].start);
    }
    const i = lineAt(lines, pos);
    moveTo(pos > lines[i].start ? lines[i].start : lines[Math.max(0, i - 1)].start);
  };

  return {
    pos,
    total,
    done: pos >= total,
    playing,
    speed,
    setSpeed,
    progress: { line: lines.filter((l) => pos >= l.start + l.length + 1).length, lines: lines.length },
    /** Play/pause; once finished, replays from the start. */
    toggle: () => setRun((r) => (pos >= total ? { ...r, pos: 0, playing: true } : { ...r, playing: !playing })),
    forward,
    back,
    skip: () => moveTo(total),
  };
}
