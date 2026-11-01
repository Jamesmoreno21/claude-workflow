import { useEffect, useEffectEvent, useRef, useState } from "react";
import { MIC_TOGGLE_KEY, PUSH_TO_TALK_CODE } from "../constants/shortcuts";
import { listen, TALK_START_EVENT, type Recognizer } from "../services/speech-recognition";
import { stopSpeaking } from "../services/tts";
import { isTyping } from "./useHotkeys";

export type TalkMode = "hold" | "toggle";

/**
 * Two ways to talk, on every screen:
 * - hold Space (outside text fields) and release to send;
 * - ⌘P / Ctrl+P to start, again to send (works while typing); Esc cancels.
 * Talking stops any narration; the transcript goes to `onTranscript`.
 */
export function usePushToTalk(onTranscript: (text: string) => void) {
  const [mode, setMode] = useState<TalkMode | null>(null);
  const [transcript, setTranscript] = useState("");
  const recognizer = useRef<Recognizer | null>(null);
  const cancelled = useRef(false);
  const latestOnTranscript = useRef(onTranscript);
  useEffect(() => {
    latestOnTranscript.current = onTranscript;
  });

  const start = (how: TalkMode = "hold") => {
    if (recognizer.current) return;
    window.dispatchEvent(new Event(TALK_START_EVENT));
    stopSpeaking();
    cancelled.current = false;
    recognizer.current = listen({
      onText: setTranscript,
      onDone: (text) => {
        recognizer.current = null;
        setMode(null);
        setTranscript("");
        if (text && !cancelled.current) latestOnTranscript.current(text);
      },
    });
    if (recognizer.current) setMode(how);
  };

  const stop = () => recognizer.current?.stop();

  const cancel = () => {
    cancelled.current = true;
    recognizer.current?.stop();
  };

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === MIC_TOGGLE_KEY) {
      // Swallow it: no print dialog, and screens don't see a "p".
      e.preventDefault();
      e.stopPropagation();
      if (recognizer.current) stop();
      else start("toggle");
    } else if (e.key === "Escape" && recognizer.current) {
      e.stopPropagation();
      cancel();
    } else if (e.code === PUSH_TO_TALK_CODE && !e.repeat && !isTyping()) {
      e.preventDefault();
      start("hold");
    }
  });

  const onKeyUp = useEffectEvent((e: KeyboardEvent) => {
    if (e.code !== PUSH_TO_TALK_CODE || mode !== "hold" || isTyping()) return;
    e.preventDefault();
    stop();
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => onKeyDown(e);
    const up = (e: KeyboardEvent) => onKeyUp(e);
    // Capture phase, so the mic shortcut wins over screen shortcuts.
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, []);

  return { listening: mode !== null, mode, transcript, start, stop };
}
