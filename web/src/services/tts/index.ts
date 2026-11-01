// Narration. Claude has no speech API, so the voice comes from one of:
//   kokoro               open-source neural voice in the browser (default, free, private)
//   elevenlabs / openai  through the local server, with keys from its environment
//   browser              the OS voice (instant, robotic; also the fallback)
import { useSyncExternalStore } from "react";
import type { TtsAvailability } from "../../../../shared/tts";
import { getPreference, setPreference, type NarrationPreferences } from "../../config/settings";
import { VOICES } from "../../constants/tts";
import { getTtsAvailability } from "../api";
import { stopAudio } from "./audio";
import { speakWithSystemVoice, stopSystemVoice } from "./browser";
import { cancelKokoro, onModelStatus, preloadKokoro, speakKokoro, type ModelStatus } from "./kokoro";
import { cancelRemote, speakRemote } from "./remote";

export interface NarrationStatus extends ModelStatus {
  available: TtsAvailability;
  speaking: boolean;
  /** Set when a provider failed and the system voice took over. */
  fallbackError?: string;
}

let status: NarrationStatus = { model: "idle", progress: 0, available: { elevenlabs: false, openai: false }, speaking: false };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<NarrationStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((notify) => notify());
}

onModelStatus((model) => setStatus(model));
void getTtsAvailability().then((available) => available && setStatus({ available }));

export function useNarrationStatus() {
  return useSyncExternalStore(
    (notify) => (listeners.add(notify), () => listeners.delete(notify)),
    () => status,
  );
}

export function updateNarration(patch: Partial<NarrationPreferences>) {
  const next = { ...getPreference("narration"), ...patch };
  setPreference("narration", next);
  if (next.muted) stopSpeaking();
  else if (next.provider === "kokoro") preloadKokoro();
}

let nextId = 1;
let currentId = 0;

/** Speaks `text`, replacing anything already playing. Resolves when done or interrupted. */
export async function speak(text: string): Promise<void> {
  const { muted, provider, voices, speed } = getPreference("narration");
  if (muted || !text.trim()) return;
  stopSpeaking();
  const id = (currentId = nextId++);
  setStatus({ speaking: true, fallbackError: undefined });
  try {
    if (provider === "kokoro") await speakKokoro(id, text, voices.kokoro ?? VOICES.kokoro![0].id, speed);
    else if (provider === "elevenlabs" || provider === "openai") await speakRemote(provider, text, voices[provider], speed);
    else await speakWithSystemVoice(text, speed);
  } catch (err) {
    if ((err as Error).name === "AbortError" || id !== currentId) return;
    // Never leave the user in silence.
    setStatus({ fallbackError: `${provider} failed, using the system voice: ${(err as Error).message}` });
    await speakWithSystemVoice(text, speed);
  } finally {
    if (id === currentId) setStatus({ speaking: false });
  }
}

export function stopSpeaking() {
  if (currentId) cancelKokoro(currentId);
  currentId = 0;
  cancelRemote();
  stopAudio();
  stopSystemVoice();
  if (status.speaking) setStatus({ speaking: false });
}
