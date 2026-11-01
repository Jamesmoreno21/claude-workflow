import { useEffect, useRef, useState } from "react";
import { useApp } from "../app/AppContext";
import { MIC_TOGGLE_LABEL } from "../constants/shortcuts";
import { speechRecognitionSupported } from "../services/speech-recognition";
import { Markdown } from "./Markdown";

interface TalkControls {
  listening: boolean;
  start(): void;
  stop(): void;
}

export function Chat({ talk }: { talk: TalkControls }) {
  const { state, send, focus, setFocus } = useApp();
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const claudeIsReplying = !state.claudeWaiting && state.chat.at(-1)?.from === "user";

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.chat.length]);

  const submit = () => {
    if (!draft.trim()) return;
    send({ type: "chat", text: draft.trim(), via: "text", about: focus.about });
    setDraft("");
  };

  return (
    <aside className="chat">
      <div className="chat-log">
        {state.chat.length === 0 && (
          <p className="empty">Ask Claude anything about what you're looking at. Press {MIC_TOGGLE_LABEL} to talk.</p>
        )}
        {state.chat.map((message) => (
          <div key={message.id} className={`msg ${message.from}`}>
            {message.about && <span className="about">{message.about.replace(":", " ")}</span>}
            <Markdown text={message.text} />
            {message.via === "voice" && <span className="via">🎙</span>}
          </div>
        ))}
        {claudeIsReplying && <div className="msg claude typing">•••</div>}
        <div ref={end} />
      </div>

      {focus.label && (
        <div className="focus-chip">
          About <b>{focus.label}</b>
          <button onClick={() => setFocus({})}>✕</button>
        </div>
      )}
      <div className="composer">
        <textarea
          rows={2}
          value={draft}
          placeholder="Ask or suggest a change…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {speechRecognitionSupported && (
          <button
            className={`mic ${talk.listening ? "on" : ""}`}
            title={`Hold to talk, or press ${MIC_TOGGLE_LABEL}`}
            onMouseDown={() => talk.start()}
            onMouseUp={talk.stop}
            onMouseLeave={() => talk.listening && talk.stop()}
          >
            🎙
          </button>
        )}
      </div>
    </aside>
  );
}
