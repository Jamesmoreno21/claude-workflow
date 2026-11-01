// The narration contract between the UI and the server's TTS proxy.

export type RemoteTtsProvider = "elevenlabs" | "openai";

export interface TtsRequest {
  provider: RemoteTtsProvider;
  text: string;
  voice?: string;
  speed?: number;
}

/** Which hosted providers the server has API keys for. */
export type TtsAvailability = Record<RemoteTtsProvider, boolean>;
