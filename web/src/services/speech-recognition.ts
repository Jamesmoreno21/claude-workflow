// The browser's Web Speech API (best in Chrome), typed for what we use.

interface SpeechResult {
  0: { transcript: string };
  isFinal: boolean;
}

export interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => Recognizer;
    webkitSpeechRecognition?: new () => Recognizer;
  }
}

const RecognizerClass = window.SpeechRecognition ?? window.webkitSpeechRecognition;

export const speechRecognitionSupported = Boolean(RecognizerClass);

/** Live transcription; `onText` gets the transcript so far, `onDone` the final one. */
export function listen({ onText, onDone }: { onText(text: string): void; onDone(text: string): void }): Recognizer | null {
  if (!RecognizerClass) return null;
  const recognizer = new RecognizerClass();
  recognizer.lang = navigator.language || "en-US";
  recognizer.continuous = true;
  recognizer.interimResults = true;

  let final = "";
  let latest = "";
  recognizer.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) final += result[0].transcript;
      else interim += result[0].transcript;
    }
    latest = (final + interim).trim();
    onText(latest);
  };
  recognizer.onerror = (e) => console.warn("speech recognition error", e.error);
  recognizer.onend = () => onDone(final.trim() || latest);
  recognizer.start();
  return recognizer;
}

/** Fired when the user starts talking, so narration can pause. */
export const TALK_START_EVENT = "wf:talk-start";
export const onTalkStart = (handler: () => void) => {
  window.addEventListener(TALK_START_EVENT, handler);
  return () => window.removeEventListener(TALK_START_EVENT, handler);
};
