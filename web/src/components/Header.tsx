import { PHASES, type Phase } from "../../../shared/protocol";
import { useApp } from "../connection";
import { MIC_TOGGLE_LABEL, voiceSupported } from "../voice";
import { VoiceSettings } from "./VoiceSettings";

// Loading phases sit under the step they lead into.
const STEP_OF: Record<Phase, Phase> = {
  research: "validation",
  validation: "validation",
  planning: "plan",
  plan: "plan",
  coding: "coding",
  code_ready: "coding",
  review: "review",
  history: "history",
  publishing: "history",
  published: "published",
};

export function Header({ onGear, connected }: { onGear: () => void; connected: boolean }) {
  const { state } = useApp();
  const current = PHASES.findIndex((p) => p.id === STEP_OF[state.phase]);

  return (
    <header className="header">
      <div className="title">
        <span className="logo">◆</span>
        <h1 title={state.context.task}>{state.context.title}</h1>
      </div>

      <ol className="stepper">
        {PHASES.map((p, i) => (
          <li key={p.id} className={i < current ? "done" : i === current ? "now" : ""}>
            <span className="dot">{i < current ? "✓" : i + 1}</span>
            {p.label}
          </li>
        ))}
      </ol>

      <div className="tools">
        {state.phase === "published" ? (
          <span className="turn you">Done</span>
        ) : (
          <span className={`turn ${!connected ? "off" : state.claudeWaiting ? "you" : "claude"}`}>
            {!connected ? "Disconnected" : state.claudeWaiting ? "Your turn" : "Claude is working"}
          </span>
        )}
        {voiceSupported && <kbd title={`Talk to Claude: ${MIC_TOGGLE_LABEL} to start and send, or hold Space`}>{MIC_TOGGLE_LABEL} talk</kbd>}
        <VoiceSettings />
        <button className="icon" title="Task context" onClick={onGear}>
          ⚙
        </button>
      </div>
    </header>
  );
}
