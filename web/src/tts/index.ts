// Narration. Claude has no speech API, so the voice comes from one of:
//   kokoro     open-source neural voice, runs in the browser (default, free, private)
//   browser    the OS voice through speechSynthesis (instant, robotic)
//   elevenlabs / openai   through the local server, using keys from its env
import { useSyncExternalStore } from "react";
import type { WorkerIn, WorkerOut } from "./kokoro.worker";

export type Provider = "kokoro" | "browser" | "elevenlabs" | "openai";

export interface TtsSettings {
  provider: Provider;
  muted: boolean;
  speed: number;
  voices: Partial<Record<Provider, string>>;
}

export const VOICES: Partial<Record<Provider, { id: string; label: string }[]>> = {
  kokoro: [
    { id: "af_heart", label: "Heart (US, warm)" },
    { id: "af_bella", label: "Bella (US)" },
    { id: "am_michael", label: "Michael (US)" },
    { id: "am_fenrir", label: "Fenrir (US)" },
    { id: "bf_emma", label: "Emma (UK)" },
    { id: "bm_george", label: "George (UK)" },
  ],
  openai: ["coral", "alloy", "ash", "ballad", "echo", "fable", "nova", "onyx", "sage", "shimmer"].map((id) => ({ id, label: id })),
};

const DEFAULTS: TtsSettings = { provider: "kokoro", muted: false, speed: 1.05, voices: {} };

function loadSettings(): TtsSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("wf.tts") ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

/* ---------- Observable state for the settings UI ---------- */

interface TtsState {
  settings: TtsSettings;
  /** Kokoro model status. */
  model: "idle" | "loading" | "ready" | "error";
  progress: number;
  device?: string;
  /** Providers the local server has keys for. */
  available: { elevenlabs: boolean; openai: boolean };
  error?: string;
  speaking: boolean;
}

let state: TtsState = {
  settings: loadSettings(),
  model: "idle",
  progress: 0,
  available: { elevenlabs: false, openai: false },
  speaking: false,
};
const listeners = new Set<() => void>();
function set(patch: Partial<TtsState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useTts() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

export function updateSettings(patch: Partial<TtsSettings>) {
  const settings = { ...state.settings, ...patch };
  try {
    localStorage.setItem("wf.tts", JSON.stringify(settings));
  } catch {}
  set({ settings });
  if (patch.muted) stopSpeaking();
  if (settings.provider === "kokoro" && !settings.muted) preload();
}

export const isMuted = () => state.settings.muted;

fetch("/api/tts/providers")
  .then((r) => (r.ok ? r.json() : null))
  .then((available) => available && set({ available }))
  .catch(() => {});

/* ---------- Audio playback (Web Audio, gapless) ---------- */

let ctx: AudioContext | null = null;
let playhead = 0;
const sources = new Set<AudioBufferSourceNode>();

function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}
// Browsers only allow audio after a user gesture; unlock on the first one.
window.addEventListener("pointerdown", () => audio(), { once: true, capture: true });
window.addEventListener("keydown", () => audio(), { once: true, capture: true });

/** Queues a buffer right after whatever is already playing. */
function enqueue(buffer: AudioBuffer): Promise<void> {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(c.destination);
  playhead = Math.max(playhead, c.currentTime + 0.05);
  src.start(playhead);
  playhead += buffer.duration;
  sources.add(src);
  return new Promise((res) => (src.onended = () => (sources.delete(src), res())));
}

/* ---------- Kokoro worker ---------- */

let worker: Worker | null = null;
let nextId = 1;
let currentId = 0;
const handlers = new Map<number, (m: WorkerOut) => void>();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<WorkerOut>) => {
    if (data.type === "progress") set({ model: "loading", progress: data.progress });
    else if (data.type === "ready") set({ model: "ready", progress: 100, device: data.device });
    else if (data.type === "error" && data.id === undefined) set({ model: "error", error: data.message });
    if ("id" in data && data.id !== undefined) handlers.get(data.id)?.(data);
  };
  return worker;
}

/** Start downloading the model early so the first narration isn't slow. */
export function preload() {
  if (state.model !== "idle") return;
  set({ model: "loading" });
  getWorker().postMessage({ type: "load" } satisfies WorkerIn);
}

function speakKokoro(text: string, id: number): Promise<void> {
  const w = getWorker();
  if (state.model === "idle") set({ model: "loading" });
  return new Promise((resolve, reject) => {
    const playing: Promise<void>[] = [];
    handlers.set(id, (m) => {
      if (id !== currentId) return;
      if (m.type === "chunk") {
        const c = audio();
        const buf = c.createBuffer(1, m.audio.length, m.rate);
        buf.copyToChannel(m.audio as Float32Array<ArrayBuffer>, 0);
        playing.push(enqueue(buf));
      } else if (m.type === "done") {
        handlers.delete(id);
        Promise.all(playing).then(() => resolve());
      } else if (m.type === "error") {
        handlers.delete(id);
        reject(new Error(m.message));
      }
    });
    w.postMessage({
      type: "speak",
      id,
      text,
      voice: state.settings.voices.kokoro ?? "af_heart",
      speed: state.settings.speed,
    } satisfies WorkerIn);
  });
}

/* ---------- Server-backed providers ---------- */

let abort: AbortController | null = null;

async function speakRemote(provider: "elevenlabs" | "openai", text: string, id: number) {
  abort = new AbortController();
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, text, voice: state.settings.voices[provider], speed: state.settings.speed }),
    signal: abort.signal,
  });
  if (!res.ok) throw new Error(await res.text());
  const buf = await audio().decodeAudioData(await res.arrayBuffer());
  if (id === currentId) await enqueue(buf);
}

/* ---------- Browser voice ---------- */

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  const lang = navigator.language.slice(0, 2);
  return (
    voices.find((v) => v.lang.startsWith(lang) && /natural|premium|enhanced|siri|google/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith(lang))
  );
}

function speakBrowser(text: string): Promise<void> {
  if (!("speechSynthesis" in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = state.settings.speed;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

/* ---------- Public API ---------- */

/** Speaks `text`, replacing anything already playing. Resolves when done or interrupted. */
export async function speak(text: string): Promise<void> {
  if (state.settings.muted || !text.trim()) return;
  stopSpeaking();
  const id = (currentId = nextId++);
  set({ speaking: true, error: undefined });
  const { provider } = state.settings;
  try {
    if (provider === "kokoro") await speakKokoro(text, id);
    else if (provider === "elevenlabs" || provider === "openai") await speakRemote(provider, text, id);
    else await speakBrowser(text);
  } catch (err) {
    if ((err as Error).name === "AbortError" || id !== currentId) return;
    // Never leave the user in silence: fall back to the OS voice.
    set({ error: `${provider} failed, using the browser voice: ${(err as Error).message}` });
    await speakBrowser(text);
  } finally {
    if (id === currentId) set({ speaking: false });
  }
}

export function stopSpeaking() {
  if (currentId) worker?.postMessage({ type: "cancel", id: currentId } satisfies WorkerIn);
  handlers.get(currentId)?.({ type: "done", id: currentId });
  currentId = 0;
  abort?.abort();
  // stop() fires `ended`, which settles the interrupted speak() promise.
  for (const s of sources) {
    try {
      s.stop();
    } catch {}
  }
  sources.clear();
  playhead = 0;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (state.speaking) set({ speaking: false });
}
