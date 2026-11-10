/// <reference lib="webworker" />
// Runs Kokoro (open-source neural TTS) off the main thread, one job at a time.
// Text is spoken phrase by phrase so audio starts quickly, and jobs someone is
// waiting for ("now") jump ahead of prefetches ("later"), even mid-text.
import { KokoroTTS } from "kokoro-js";
import { KOKORO_MODEL } from "../../constants/tts";
import type { KokoroRequest, KokoroResponse, Priority } from "./kokoro.protocol";
import { splitPhrases } from "./phrases";

const post = (m: KokoroResponse, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

interface Job {
  id: number;
  phrases: string[];
  voice: string;
  speed: number;
  priority: Priority;
}

let model: Promise<KokoroTTS> | null = null;
const jobs: Job[] = [];
const cancelled = new Set<number>();
let working = false;
let current: Job | null = null;

function load() {
  model ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    const webgpu = Boolean(await gpu?.requestAdapter());
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
      dtype: webgpu ? "fp32" : "q8",
      device: webgpu ? "webgpu" : "wasm",
      progress_callback: (p) => {
        if (p.status === "progress" && "progress" in p) post({ type: "progress", progress: p.progress });
      },
    });
    // The first inference compiles kernels; do it now, not on the user's first sentence.
    await tts.generate("Ready.", { voice: "af_heart" });
    // On CPU, the ONNX runtime uses several threads only on a cross-origin isolated page (COOP/COEP).
    post({ type: "ready", device: webgpu ? "webgpu" : "wasm", multiThreaded: self.crossOriginIsolated });
    return tts;
  })();
  model.catch(() => (model = null));
  return model;
}

/** "now" jobs go before every "later" job; otherwise first come, first served. */
function queue(job: Job) {
  const firstLater = jobs.findIndex((j) => j.priority === "later");
  if (job.priority === "now" && firstLater >= 0) jobs.splice(firstLater, 0, job);
  else jobs.push(job);
}

async function work() {
  if (working) return;
  working = true;
  try {
    const tts = await load();
    while (jobs.length) {
      const job = (current = jobs.shift()!);
      while (job.phrases.length && !cancelled.has(job.id)) {
        // A prefetch steps aside, keeping its place, when someone is waiting to hear something.
        if (job.priority === "later" && jobs.some((j) => j.priority === "now")) {
          jobs.push(job);
          break;
        }
        const { audio, sampling_rate } = await tts.generate(job.phrases.shift()!, { voice: job.voice as never, speed: job.speed });
        const samples = audio as Float32Array;
        post({ type: "chunk", id: job.id, audio: samples, rate: sampling_rate }, [samples.buffer]);
      }
      if (!job.phrases.length || cancelled.has(job.id)) {
        cancelled.delete(job.id);
        post({ type: "done", id: job.id });
      }
    }
  } catch (err) {
    for (const job of jobs.splice(0)) post({ type: "error", id: job.id, message: String(err) });
    post({ type: "error", message: String(err) });
  } finally {
    current = null;
    working = false;
  }
}

self.onmessage = ({ data }: MessageEvent<KokoroRequest>) => {
  if (data.type === "load") return void load().catch((err) => post({ type: "error", message: String(err) }));
  if (data.type === "cancel") {
    const index = jobs.findIndex((j) => j.id === data.id);
    if (index >= 0) {
      jobs.splice(index, 1);
      post({ type: "done", id: data.id });
    } else cancelled.add(data.id); // the running job stops after its current phrase
    return;
  }
  if (data.type === "prioritize") {
    if (current?.id === data.id) current.priority = "now";
    const index = jobs.findIndex((j) => j.id === data.id);
    if (index >= 0) queue({ ...jobs.splice(index, 1)[0], priority: "now" });
    return;
  }
  queue({ id: data.id, phrases: splitPhrases(data.text), voice: data.voice, speed: data.speed, priority: data.priority });
  void work();
};
