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
import { onModelStatus, playKokoro, prefetchKokoro, preloadKokoro, type ModelStatus } from "./kokoro";
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

// Load and warm up the model as soon as the cockpit opens, not on the first narration.
{
  const { muted, provider } = getPreference("narration");
  if (!muted && provider === "kokoro" && typeof Worker !== "undefined") setTimeout(preloadKokoro, 1500);
}
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
let stopKokoro: (() => void) | null = null;

const kokoroVoice = (voices: NarrationPreferences["voices"]) => voices.kokoro ?? VOICES.kokoro![0].id;

/** Speaks `text`, replacing anything already playing. Resolves when done or interrupted. */
export async function speak(text: string): Promise<void> {
  const { muted, provider, voices, speed } = getPreference("narration");
  if (muted || !text.trim()) return;
  stopSpeaking();
  const id = (currentId = nextId++);
  setStatus({ speaking: true, fallbackError: undefined });
  try {
    if (provider === "kokoro") {
      const playback = playKokoro(text, kokoroVoice(voices), speed);
      stopKokoro = playback.stop;
      await playback.finished;
    } else if (provider === "elevenlabs" || provider === "openai") await speakRemote(provider, text, voices[provider], speed);
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

/** Prepares narration that's likely next (e.g. the next slide), so it starts without delay. */
export function prefetchNarration(text: string) {
  const { muted, provider, voices, speed } = getPreference("narration");
  if (!muted && provider === "kokoro" && text.trim()) prefetchKokoro(text, kokoroVoice(voices), speed);
}

export function stopSpeaking() {
  stopKokoro?.();
  stopKokoro = null;
  currentId = 0;
  cancelRemote();
  stopAudio();
  stopSystemVoice();
  if (status.speaking) setStatus({ speaking: false });
}
