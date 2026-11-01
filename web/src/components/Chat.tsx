import { useEffect, useRef, useState } from "react";
import { useApp } from "../connection";
import { voiceSupported } from "../voice";
import { Markdown } from "./Markdown";

export function Chat({ ptt }: { ptt: { listening: boolean; start(): void; stop(): void } }) {
  const { state, send, focus, setFocus } = useApp();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.chat.length]);

  const submit = () => {
    if (!text.trim()) return;
    send({ type: "chat", text: text.trim(), via: "text", about: focus.about });
    setText("");
  };

  return (
    <aside className="chat">
      <div className="chat-log">
        {state.chat.length === 0 && <p className="empty">Ask Claude anything about what you're looking at. Hold Space to talk.</p>}
        {state.chat.map((m) => (
          <div key={m.id} className={`msg ${m.from}`}>
            {m.about && <span className="about">{m.about.replace(":", " ")}</span>}
            <Markdown text={m.text} />
            {m.via === "voice" && <span className="via">🎙</span>}
          </div>
        ))}
        {!state.claudeWaiting && state.chat.at(-1)?.from === "user" && <div className="msg claude typing">•••</div>}
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
          value={text}
          placeholder="Ask or suggest a change…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {voiceSupported && (
          <button
            className={`mic ${ptt.listening ? "on" : ""}`}
            title="Hold to talk"
            onMouseDown={ptt.start}
            onMouseUp={ptt.stop}
            onMouseLeave={() => ptt.listening && ptt.stop()}
          >
            🎙
          </button>
        )}
      </div>
    </aside>
  );
}
