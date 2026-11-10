import { FINISHED_PHASES, PHASES } from "../../../shared/protocol";
import { useApp } from "../app/AppContext";
import { STEP_OF } from "../constants/phases";
import { MIC_TOGGLE_LABEL } from "../constants/shortcuts";
import { speechRecognitionSupported } from "../services/speech-recognition";
import { NarrationSettings } from "./NarrationSettings";

function TurnIndicator({ connected }: { connected: boolean }) {
  const { state } = useApp();
  if (FINISHED_PHASES.includes(state.phase)) return <span className="turn you">Done</span>;
  if (!connected) return <span className="turn off">Disconnected</span>;
  return state.claudeWaiting ? <span className="turn you">Your turn</span> : <span className="turn claude">Claude is working</span>;
}

export function Header({ onOpenContext, connected }: { onOpenContext: () => void; connected: boolean }) {
  const { state } = useApp();
  const currentStep = PHASES.findIndex((p) => p.id === STEP_OF[state.phase]);

  return (
    <header className="header">
      <div className="title">
        <span className="logo">◆</span>
        <h1 title={state.context.task}>{state.context.title}</h1>
      </div>

      <ol className="stepper">
        {PHASES.map((step, i) => (
          <li key={step.id} className={i < currentStep ? "done" : i === currentStep ? "now" : ""}>
            <span className="dot">{i < currentStep ? "✓" : i + 1}</span>
            {step.label}
          </li>
        ))}
      </ol>

      <div className="tools">
        <TurnIndicator connected={connected} />
        {speechRecognitionSupported && (
          <kbd title={`Talk to Claude: ${MIC_TOGGLE_LABEL} to start and send, or hold Space`}>{MIC_TOGGLE_LABEL} talk</kbd>
        )}
        <NarrationSettings />
        <button className="icon" title="Task context" onClick={onOpenContext}>
          ⚙
        </button>
      </div>
    </header>
  );
}
