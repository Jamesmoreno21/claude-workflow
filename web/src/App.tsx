import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ChatMessage, UserEvent, WorkflowState } from "../../shared/protocol";
import { AppContext, type Focus, type SendOptions } from "./app/AppContext";
import { Chat } from "./components/Chat";
import { ContextDrawer } from "./components/ContextDrawer";
import { HandoffOverlay, type Handoff } from "./components/HandoffOverlay";
import { Header } from "./components/Header";
import { PHASES_WITH_CHAT } from "./constants/phases";
import { MIC_TOGGLE_LABEL } from "./constants/shortcuts";
import { useConnection } from "./hooks/useConnection";
import { usePushToTalk } from "./hooks/usePushToTalk";
import { CodeReadyScreen } from "./screens/CodeReadyScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { LoadingScreen } from "./screens/LoadingScreen";
import { PlanScreen } from "./screens/PlanScreen";
import { PublishedScreen } from "./screens/PublishedScreen";
import { ValidationScreen } from "./screens/ValidationScreen";
import { speak } from "./services/tts";

// The code editor (Monaco) is large; load it only when coding starts.
const WorkspaceScreen = lazy(() => import("./screens/workspace/WorkspaceScreen").then((m) => ({ default: m.WorkspaceScreen })));

const SCREENS = {
  research: LoadingScreen,
  planning: LoadingScreen,
  publishing: LoadingScreen,
  validation: ValidationScreen,
  plan: PlanScreen,
  coding: WorkspaceScreen,
  code_ready: CodeReadyScreen,
  review: WorkspaceScreen,
  history: HistoryScreen,
  published: PublishedScreen,
  ended: PublishedScreen,
};

/** Speaks Claude's new chat messages, never the history loaded on (re)connect. */
function useSpeakClaudeReplies(chat: ChatMessage[]) {
  const spoken = useRef<Set<string> | null>(null);
  useEffect(() => {
    const fromClaude = chat.filter((m) => m.from === "claude");
    if (!spoken.current) {
      spoken.current = new Set(fromClaude.map((m) => m.id));
      return;
    }
    const fresh = fromClaude.filter((m) => !spoken.current!.has(m.id));
    fresh.forEach((m) => spoken.current!.add(m.id));
    if (fresh.length) void speak(fresh.map((m) => m.text).join(" "));
  }, [chat]);
}

/**
 * Tracks a hand-off to Claude: set when the user sends something Claude must
 * act on, cleared once Claude has taken it and waits again, or the phase moves.
 */
function useHandoff(state: WorkflowState) {
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [seenState, setSeenState] = useState(state);
  // Several server updates can land in one render, so compare counters, not flags.
  if (handoff && state !== seenState) {
    setSeenState(state);
    if (state.phase !== handoff.phase || state.waitCount > handoff.waitCount) setHandoff(null);
    else if (!state.claudeWaiting && !handoff.claudeTookOver) setHandoff({ ...handoff, claudeTookOver: true });
  }
  const start = (label: string) => {
    setSeenState(state);
    setHandoff({ label, sentAt: Date.now(), phase: state.phase, waitCount: state.waitCount, claudeTookOver: false });
  };
  return { handoff, start };
}

/** One workflow run. Keyed by the run id, so a new run starts with no leftover screen state. */
function Cockpit({ state, connected, sendEvent }: { state: WorkflowState; connected: boolean; sendEvent(event: UserEvent): void }) {
  const { handoff, start: startHandoff } = useHandoff(state);
  const send = (event: UserEvent, options?: SendOptions) => {
    sendEvent(event);
    if (options?.handoff) startHandoff(options.handoff);
  };
  const [focus, setFocus] = useState<Focus>({});
  const [contextOpen, setContextOpen] = useState(false);
  const talk = usePushToTalk((text) => send({ type: "chat", text, via: "voice", about: focus.about }));
  useSpeakClaudeReplies(state.chat);

  const Screen = SCREENS[state.phase];
  const withChat = PHASES_WITH_CHAT.includes(state.phase);

  return (
    <AppContext.Provider value={{ state, send, focus, setFocus }}>
      <div className="app">
        <Header onOpenContext={() => setContextOpen(true)} connected={connected} />
        <div className={`body ${withChat ? "with-chat" : ""}`}>
          <main>
            <Suspense fallback={<LoadingScreen />}>
              <Screen />
            </Suspense>
            {handoff && <HandoffOverlay handoff={handoff} status={state.status.message} />}
          </main>
          {withChat && <Chat talk={talk} />}
        </div>
        {talk.listening && (
          <div className="ptt">
            <span className="pulse" />
            <div>
              <small>
                {focus.label ? `About ${focus.label}` : "Listening"} ·{" "}
                {talk.mode === "toggle" ? `${MIC_TOGGLE_LABEL} to send, Esc to cancel` : "release Space to send"}
              </small>
              <p>{talk.transcript || "…"}</p>
            </div>
          </div>
        )}
        {contextOpen && <ContextDrawer onClose={() => setContextOpen(false)} />}
      </div>
    </AppContext.Provider>
  );
}

export function App() {
  const { state, connected, send } = useConnection();
  if (!state)
    return (
      <div className="boot">
        <div className="orb" />
        <p>{connected ? "Waiting for Claude to start the workflow…" : "Connecting to Claude Code…"}</p>
      </div>
    );
  return <Cockpit key={state.id} state={state} connected={connected} sendEvent={send} />;
}
