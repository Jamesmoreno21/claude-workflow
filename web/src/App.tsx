import { useEffect, useRef, useState } from "react";
import type { Phase } from "../../shared/protocol";
import { Chat } from "./components/Chat";
import { ContextDrawer } from "./components/ContextDrawer";
import { Header } from "./components/Header";
import { AppContext, useConnection, type Focus } from "./connection";
import { CodeReady } from "./screens/CodeReady";
import { Coding } from "./screens/Coding";
import { History } from "./screens/History";
import { Loading } from "./screens/Loading";
import { PlanScreen } from "./screens/Plan";
import { Published } from "./screens/Published";
import { Review } from "./screens/Review";
import { Validation } from "./screens/Validation";
import { speak } from "./tts";
import { usePushToTalk } from "./voice";

const WITH_CHAT: Phase[] = ["validation", "plan", "coding", "code_ready", "review", "history"];

export function App() {
  const { state, connected, send } = useConnection();
  const [focus, setFocus] = useState<Focus>({});
  const [gearOpen, setGearOpen] = useState(false);

  const ptt = usePushToTalk((text) => send({ type: "chat", text, via: "voice", about: focus.about }));

  // Speak every new message from Claude.
  const spoken = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!state) return;
    const claude = state.chat.filter((m) => m.from === "claude");
    if (!spoken.current) {
      spoken.current = new Set(claude.map((m) => m.id)); // don't replay history on reload
      return;
    }
    const fresh = claude.filter((m) => !spoken.current!.has(m.id));
    fresh.forEach((m) => spoken.current!.add(m.id));
    if (fresh.length) speak(fresh.map((m) => m.text).join(" "));
  }, [state?.chat.length]);

  if (!state)
    return (
      <div className="boot">
        <div className="orb" />
        <p>{connected ? "Waiting for Claude to start the workflow…" : "Connecting to Claude Code…"}</p>
      </div>
    );

  const screen = (() => {
    switch (state.phase) {
      case "research":
      case "planning":
      case "publishing":
        return <Loading />;
      case "validation":
        return <Validation />;
      case "plan":
        return <PlanScreen />;
      case "coding":
        return <Coding />;
      case "code_ready":
        return <CodeReady />;
      case "review":
        return <Review />;
      case "history":
        return <History />;
      case "published":
        return <Published />;
    }
  })();

  return (
    <AppContext.Provider value={{ state, send, focus, setFocus }}>
      <div className="app">
        <Header onGear={() => setGearOpen(true)} connected={connected} />
        <div className={`body ${WITH_CHAT.includes(state.phase) ? "with-chat" : ""}`}>
          <main>{screen}</main>
          {WITH_CHAT.includes(state.phase) && <Chat ptt={ptt} />}
        </div>
        {ptt.listening && (
          <div className="ptt">
            <span className="pulse" />
            <div>
              <small>{focus.label ? `About ${focus.label}` : "Listening"} · release Space to send</small>
              <p>{ptt.interim || "…"}</p>
            </div>
          </div>
        )}
        {gearOpen && <ContextDrawer onClose={() => setGearOpen(false)} />}
      </div>
    </AppContext.Provider>
  );
}
