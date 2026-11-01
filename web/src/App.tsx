import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../shared/protocol";
import { AppContext, type Focus } from "./app/AppContext";
import { Chat } from "./components/Chat";
import { ContextDrawer } from "./components/ContextDrawer";
import { Header } from "./components/Header";
import { PHASES_WITH_CHAT } from "./constants/phases";
import { MIC_TOGGLE_LABEL } from "./constants/shortcuts";
import { useConnection } from "./hooks/useConnection";
import { usePushToTalk } from "./hooks/usePushToTalk";
import { CodeReadyScreen } from "./screens/CodeReadyScreen";
import { CodingScreen } from "./screens/CodingScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { LoadingScreen } from "./screens/LoadingScreen";
import { PlanScreen } from "./screens/PlanScreen";
import { PublishedScreen } from "./screens/PublishedScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { ValidationScreen } from "./screens/ValidationScreen";
import { speak } from "./services/tts";

const SCREENS = {
  research: LoadingScreen,
  planning: LoadingScreen,
  publishing: LoadingScreen,
  validation: ValidationScreen,
  plan: PlanScreen,
  coding: CodingScreen,
  code_ready: CodeReadyScreen,
  review: ReviewScreen,
  history: HistoryScreen,
  published: PublishedScreen,
};

/** Speaks Claude's new chat messages, never the history loaded on (re)connect. */
function useSpeakClaudeReplies(chat: ChatMessage[] | undefined) {
  const spoken = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!chat) return;
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

export function App() {
  const { state, connected, send } = useConnection();
  const [focus, setFocus] = useState<Focus>({});
  const [contextOpen, setContextOpen] = useState(false);
  const talk = usePushToTalk((text) => send({ type: "chat", text, via: "voice", about: focus.about }));
  useSpeakClaudeReplies(state?.chat);

  if (!state)
    return (
      <div className="boot">
        <div className="orb" />
        <p>{connected ? "Waiting for Claude to start the workflow…" : "Connecting to Claude Code…"}</p>
      </div>
    );

  const Screen = SCREENS[state.phase];
  const withChat = PHASES_WITH_CHAT.includes(state.phase);

  return (
    <AppContext.Provider value={{ state, send, focus, setFocus }}>
      <div className="app">
        <Header onOpenContext={() => setContextOpen(true)} connected={connected} />
        <div className={`body ${withChat ? "with-chat" : ""}`}>
          <main>
            <Screen />
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
