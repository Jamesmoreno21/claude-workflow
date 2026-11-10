import { enqueue, pcmBuffer } from "./audio";
import type { KokoroRequest, KokoroResponse, Priority } from "./kokoro.protocol";

// Client for the Kokoro worker. Each text becomes a clip that fills phrase by
// phrase; clips are cached, so narration that was prefetched plays at once.

export type ModelStatus = {
  model: "idle" | "loading" | "ready" | "error";
  progress: number;
  device?: string;
  multiThreaded?: boolean;
  error?: string;
};

interface Clip {
  id: number;
  chunks: Float32Array[];
  rate: number;
  done: boolean;
  error?: string;
  listeners: Set<() => void>;
}

const MAX_CACHED_CLIPS = 16;

let worker: Worker | null = null;
let nextId = 1;
let status: ModelStatus = { model: "idle", progress: 0 };
const statusListeners = new Set<(status: ModelStatus) => void>();
const clips = new Map<string, Clip>();
const clipsById = new Map<number, Clip>();

function setStatus(patch: Partial<ModelStatus>) {
  status = { ...status, ...patch };
  statusListeners.forEach((listener) => listener(status));
}

export const onModelStatus = (listener: (status: ModelStatus) => void) => {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
};

function receive({ data }: MessageEvent<KokoroResponse>) {
  if (data.type === "progress") return setStatus({ model: "loading", progress: data.progress });
  if (data.type === "ready") return setStatus({ model: "ready", progress: 100, device: data.device, multiThreaded: data.multiThreaded });
  if (data.type === "error" && data.id === undefined) return setStatus({ model: "error", error: data.message });
  const clip = data.id === undefined ? undefined : clipsById.get(data.id);
  if (!clip) return;
  if (data.type === "chunk") {
    clip.chunks.push(data.audio);
    clip.rate = data.rate;
  } else if (data.type === "done") clip.done = true;
  else if (data.type === "error") clip.error = data.message;
  clip.listeners.forEach((listener) => listener());
}

function post(message: KokoroRequest) {
  if (!worker) {
    worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = receive;
  }
  worker.postMessage(message);
}

/** Downloads and warms up the model early, so the first narration isn't slow. */
export function preloadKokoro() {
  if (status.model !== "idle") return;
  setStatus({ model: "loading" });
  post({ type: "load" });
}

const clipKey = (text: string, voice: string, speed: number) => `${voice}|${speed}|${text}`;

function forget(key: string) {
  const clip = clips.get(key);
  if (!clip) return;
  clips.delete(key);
  clipsById.delete(clip.id);
}

/** The cached clip for this text, or a new one the worker starts generating. */
function clipFor(text: string, voice: string, speed: number, priority: Priority): Clip {
  const key = clipKey(text, voice, speed);
  const cached = clips.get(key);
  if (cached && !cached.error) {
    if (priority === "now" && !cached.done) post({ type: "prioritize", id: cached.id });
    return cached;
  }
  if (status.model === "idle") setStatus({ model: "loading" });
  const clip: Clip = { id: nextId++, chunks: [], rate: 24_000, done: false, listeners: new Set() };
  clips.set(key, clip);
  clipsById.set(clip.id, clip);
  while (clips.size > MAX_CACHED_CLIPS) forget(clips.keys().next().value!);
  post({ type: "generate", id: clip.id, text, voice, speed, priority });
  return clip;
}

/** Generates speech in the background so it plays instantly later (e.g. the next slide). */
export function prefetchKokoro(text: string, voice: string, speed: number) {
  clipFor(text, voice, speed, "later");
}

/** Plays as audio arrives; `finished` settles when the last phrase has played or `stop()` is called. */
export function playKokoro(text: string, voice: string, speed: number) {
  const key = clipKey(text, voice, speed);
  const clip = clipFor(text, voice, speed, "now");
  let stopped = false;
  let played = 0;
  const playing: Promise<void>[] = [];
  let settle: (error?: Error) => void = () => {};

  const finished = new Promise<void>((resolve, reject) => {
    settle = (error) => {
      clip.listeners.delete(pump);
      if (error) reject(error);
      else resolve();
    };
  });
  const pump = () => {
    if (stopped) return;
    while (played < clip.chunks.length) playing.push(enqueue(pcmBuffer(clip.chunks[played++], clip.rate)));
    if (clip.error) settle(new Error(clip.error));
    else if (clip.done) void Promise.all(playing).then(() => settle());
  };
  clip.listeners.add(pump);
  pump();

  const stop = () => {
    stopped = true;
    settle();
    // Unfinished speech nobody will hear: stop generating it and drop it from the cache.
    if (!clip.done) {
      post({ type: "cancel", id: clip.id });
      forget(key);
    }
  };
  return { finished, stop };
}
