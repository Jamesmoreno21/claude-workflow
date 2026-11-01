import type { RemoteTtsProvider } from "../../../../shared/tts";
import { synthesize } from "../api";
import { audioContext, enqueue } from "./audio";

let inFlight: AbortController | null = null;

/** ElevenLabs or OpenAI through the local server, which holds the API keys. */
export async function speakRemote(provider: RemoteTtsProvider, text: string, voice: string | undefined, speed: number) {
  inFlight = new AbortController();
  const mp3 = await synthesize({ provider, text, voice, speed }, inFlight.signal);
  await enqueue(await audioContext().decodeAudioData(mp3));
}

export const cancelRemote = () => inFlight?.abort();
