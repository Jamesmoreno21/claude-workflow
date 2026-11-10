// Messages between the page and the Kokoro worker.

/** "now": someone is waiting to hear it. "later": prefetch, yields to any "now" job. */
export type Priority = "now" | "later";

export type KokoroRequest =
  | { type: "load" }
  | { type: "generate"; id: number; text: string; voice: string; speed: number; priority: Priority }
  | { type: "prioritize"; id: number }
  | { type: "cancel"; id: number };

export type KokoroResponse =
  | { type: "progress"; progress: number }
  | { type: "ready"; device: string; multiThreaded: boolean }
  | { type: "chunk"; id: number; audio: Float32Array; rate: number }
  | { type: "done"; id: number }
  | { type: "error"; id?: number; message: string };
