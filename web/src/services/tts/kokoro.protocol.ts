// Messages between the page and the Kokoro worker.

export type KokoroRequest =
  { type: "load" } | { type: "speak"; id: number; text: string; voice: string; speed: number } | { type: "cancel"; id: number };

export type KokoroResponse =
  | { type: "progress"; progress: number }
  | { type: "ready"; device: string }
  | { type: "chunk"; id: number; audio: Float32Array; rate: number }
  | { type: "done"; id: number }
  | { type: "error"; id?: number; message: string };
