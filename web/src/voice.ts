import { useCallback, useEffect, useRef, useState } from "react";
import { stopSpeaking } from "./tts";

// Push-to-talk listening through the browser's Web Speech API.
// Narration (speaking) lives in ./tts.

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const SpeechRecognition: (new () => Recognition) | undefined =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export const voiceSupported = Boolean(SpeechRecognition);

export const PTT_KEY = "Space";
export const MIC_TOGGLE_LABEL = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘P" : "Ctrl+P";

function isTyping(el: Element | null) {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
}

/**
 * Two ways to talk, on every screen:
 * - hold Space (outside text fields) and release to send;
 * - press ⌘P / Ctrl+P to start, again to send (works while typing); Esc cancels.
 * Talking stops any narration; the transcript goes to `onTranscript`.
 */
export function usePushToTalk(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef("");
  const mode = useRef<"hold" | "toggle">("hold");
  const cancelled = useRef(false);
  const cb = useRef(onTranscript);
  cb.current = onTranscript;

  const start = useCallback((how: "hold" | "toggle" = "hold") => {
    if (!SpeechRecognition || rec.current) return;
    mode.current = how;
    window.dispatchEvent(new Event("wf:ptt-start"));
    stopSpeaking();
    const r = new SpeechRecognition();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    finalText.current = "";
    cancelled.current = false;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript;
        else live += res[0].transcript;
      }
      setInterim((finalText.current + live).trim());
    };
    r.onerror = (e) => console.warn("speech error", e.error);
    r.onend = () => {
      rec.current = null;
      setListening(false);
      const text = finalText.current.trim() || interimRef.current.trim();
      setInterim("");
      if (text && !cancelled.current) cb.current(text);
    };
    rec.current = r;
    r.start();
    setListening(true);
  }, []);

  const interimRef = useRef("");
  interimRef.current = interim;

  const stop = useCallback(() => rec.current?.stop(), []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        // Swallow it so the browser doesn't print and screens don't see "p".
        e.preventDefault();
        e.stopPropagation();
        return rec.current ? stop() : start("toggle");
      }
      if (e.key === "Escape" && rec.current) {
        e.stopPropagation();
        cancelled.current = true;
        return stop();
      }
      if (e.code !== PTT_KEY || e.repeat || isTyping(document.activeElement)) return;
      e.preventDefault();
      start("hold");
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== PTT_KEY || mode.current !== "hold" || isTyping(document.activeElement)) return;
      e.preventDefault();
      stop();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [start, stop]);

  return { listening, interim, start, stop, mode };
}
