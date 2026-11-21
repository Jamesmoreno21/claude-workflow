import { useEffect, useState } from "react";
import { HANDOFF_STALL_MS } from "../constants/ui";

export interface Handoff {
  label: string;
  sentAt: number;
  phase: string;
  /** state.waitCount when the user sent it; a higher count means Claude handled it and is waiting again. */
  waitCount: number;
  /** Claude has taken the event (it stopped waiting at some point since). */
  claudeTookOver: boolean;
}

/** Dims the screen while Claude works on what the user just sent. */
export function HandoffOverlay({ handoff, status, onDismiss }: { handoff: Handoff; status: string; onDismiss(): void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.round((now - handoff.sentAt) / 1000));
  const stalled = !handoff.claudeTookOver && now - handoff.sentAt > HANDOFF_STALL_MS;

  return (
    <div className="handoff" role="status" aria-live="polite">
      <div className="orb" />
      <h2>{handoff.label}</h2>
      {handoff.claudeTookOver && status && <p className="status">{status}</p>}
      <p className="muted">{seconds}s</p>
      {stalled && (
        <p className="handoff-stalled">
          Claude hasn't picked this up yet. It's saved; if this persists, type "continue" in the Claude Code terminal.
        </p>
      )}
      {/* Never a dead end: everything the user does next is queued for Claude too. */}
      <button className="ghost" onClick={onDismiss}>
        Keep working
      </button>
    </div>
  );
}
