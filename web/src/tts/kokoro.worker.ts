/// <reference lib="webworker" />
// Runs Kokoro (open-source neural TTS) off the main thread. Audio comes back
// one sentence at a time so narration starts before the whole text is ready.
import { KokoroTTS, TextSplitterStream } from "kokoro-js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

export type WorkerIn =
  | { type: "load" }
  | { type: "speak"; id: number; text: string; voice: string; speed: number }
  | { type: "cancel"; id: number };

export type WorkerOut =
  | { type: "progress"; progress: number }
  | { type: "ready"; device: string }
  | { type: "chunk"; id: number; audio: Float32Array; rate: number }
  | { type: "done"; id: number }
  | { type: "error"; id?: number; message: string };

const post = (m: WorkerOut, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

let model: Promise<KokoroTTS> | null = null;
const cancelled = new Set<number>();

function load() {
  model ??= (async () => {
    const webgpu = Boolean(await (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter());
    const device = webgpu ? "webgpu" : "wasm";
    const tts = await KokoroTTS.from_pretrained(MODEL, {
      dtype: webgpu ? "fp32" : "q8",
      device,
      progress_callback: (p) => {
        if (p.status === "progress" && "progress" in p) post({ type: "progress", progress: p.progress });
      },
    });
    post({ type: "ready", device });
    return tts;
  })();
  model.catch(() => (model = null));
  return model;
}

self.onmessage = async ({ data }: MessageEvent<WorkerIn>) => {
  if (data.type === "cancel") return void cancelled.add(data.id);
  try {
    const tts = await load();
    if (data.type !== "speak") return;
    // kokoro-js 1.2.1 never closes the splitter it makes for string input, so
    // the last sentence would never be spoken. Feed it a closed one instead.
    const sentences = new TextSplitterStream();
    sentences.push(data.text);
    sentences.close();
    for await (const { audio } of tts.stream(sentences, { voice: data.voice as never, speed: data.speed })) {
      if (cancelled.has(data.id)) break;
      const samples = audio.audio as Float32Array;
      post({ type: "chunk", id: data.id, audio: samples, rate: audio.sampling_rate }, [samples.buffer]);
    }
    post({ type: "done", id: data.id });
  } catch (err) {
    post({ type: "error", id: data.type === "speak" ? data.id : undefined, message: String(err) });
  } finally {
    if (data.type === "speak") cancelled.delete(data.id);
  }
};
