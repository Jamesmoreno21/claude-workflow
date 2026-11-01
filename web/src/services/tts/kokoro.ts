import type { KokoroRequest, KokoroResponse } from "./kokoro.protocol";
import { enqueue, pcmBuffer } from "./audio";

// Client for the Kokoro worker: model loading and sentence-by-sentence speech.

export type ModelStatus = { model: "idle" | "loading" | "ready" | "error"; progress: number; device?: string; error?: string };

let worker: Worker | null = null;
let status: ModelStatus = { model: "idle", progress: 0 };
const statusListeners = new Set<(status: ModelStatus) => void>();
const replies = new Map<number, (message: KokoroResponse) => void>();

function setStatus(patch: Partial<ModelStatus>) {
  status = { ...status, ...patch };
  statusListeners.forEach((listener) => listener(status));
}

export const onModelStatus = (listener: (status: ModelStatus) => void) => {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
};

function post(message: KokoroRequest) {
  if (!worker) {
    worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<KokoroResponse>) => {
      if (data.type === "progress") setStatus({ model: "loading", progress: data.progress });
      else if (data.type === "ready") setStatus({ model: "ready", progress: 100, device: data.device });
      else if (data.type === "error" && data.id === undefined) setStatus({ model: "error", error: data.message });
      if ("id" in data && data.id !== undefined) replies.get(data.id)?.(data);
    };
  }
  worker.postMessage(message);
}

/** Starts the model download early so the first narration isn't slow. */
export function preloadKokoro() {
  if (status.model !== "idle") return;
  setStatus({ model: "loading" });
  post({ type: "load" });
}

/** Speaks as audio arrives; resolves once the last sentence has played. */
export function speakKokoro(id: number, text: string, voice: string, speed: number): Promise<void> {
  if (status.model === "idle") setStatus({ model: "loading" });
  return new Promise((resolve, reject) => {
    const sentences: Promise<void>[] = [];
    replies.set(id, (message) => {
      if (message.type === "chunk") sentences.push(enqueue(pcmBuffer(message.audio, message.rate)));
      else if (message.type === "done") {
        replies.delete(id);
        Promise.all(sentences).then(() => resolve());
      } else if (message.type === "error") {
        replies.delete(id);
        reject(new Error(message.message));
      }
    });
    post({ type: "speak", id, text, voice, speed });
  });
}

/** Stops generating for `id` and settles its promise. */
export function cancelKokoro(id: number) {
  post({ type: "cancel", id });
  replies.get(id)?.({ type: "done", id });
}
