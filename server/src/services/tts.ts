import type { TtsAvailability, TtsRequest } from "../../../shared/tts.js";
import {
  ELEVENLABS_SPEED_RANGE,
  ELEVENLABS_TTS_URL,
  OPENAI_DEFAULT_VOICE,
  OPENAI_TTS_INSTRUCTIONS,
  OPENAI_TTS_URL,
  TTS_MAX_CHARS,
} from "../config/constants.js";
import { settings } from "../config/settings.js";

// Hosted narration voices. Keys stay in the server's environment (set with
// `claude mcp add -e`) and never reach the browser.

export const availableTtsProviders = (): TtsAvailability => ({
  elevenlabs: Boolean(settings.tts.elevenlabs.apiKey),
  openai: Boolean(settings.tts.openai.apiKey),
});

const clamp = (n: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, n));

function elevenlabsRequest(text: string, voice: string | undefined, speed: number): [string, RequestInit] {
  const { apiKey, voiceId, model } = settings.tts.elevenlabs;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  const url = `${ELEVENLABS_TTS_URL}/${encodeURIComponent(voice ?? voiceId)}?output_format=mp3_44100_128`;
  return [
    url,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: model, voice_settings: { speed: clamp(speed, ELEVENLABS_SPEED_RANGE) } }),
    },
  ];
}

function openaiRequest(text: string, voice: string | undefined, speed: number): [string, RequestInit] {
  const { apiKey, model } = settings.tts.openai;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return [
    OPENAI_TTS_URL,
    {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        voice: voice ?? OPENAI_DEFAULT_VOICE,
        input: text,
        speed,
        response_format: "mp3",
        instructions: OPENAI_TTS_INSTRUCTIONS,
      }),
    },
  ];
}

/** MP3 audio for the text; errors carry a message safe to show the user. */
export async function synthesize({ provider, text, voice, speed = 1 }: TtsRequest): Promise<ArrayBuffer> {
  const input = text.slice(0, TTS_MAX_CHARS);
  const build = { elevenlabs: elevenlabsRequest, openai: openaiRequest }[provider];
  if (!build) throw new Error(`Unknown provider ${provider}`);
  const res = await fetch(...build(input, voice, speed));
  if (!res.ok) throw new Error(`${provider} returned ${res.status}`);
  return res.arrayBuffer();
}
