// Proxies narration to hosted TTS providers so API keys stay in the server's
// environment (set them with `claude mcp add -e`) and never reach the browser.

const MAX_CHARS = 5000;

export const ttsProviders = () => ({
  elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
  openai: Boolean(process.env.OPENAI_API_KEY),
});

export interface TtsRequest {
  provider: "elevenlabs" | "openai";
  text: string;
  voice?: string;
  speed?: number;
}

/** Returns MP3 audio, or throws with a message safe to show the user. */
export async function synthesize({ provider, text, voice, speed = 1 }: TtsRequest): Promise<ArrayBuffer> {
  const input = text.slice(0, MAX_CHARS);
  let res: Response;
  if (provider === "elevenlabs") {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
    const voiceId = voice ?? process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: input,
        model_id: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
        voice_settings: { speed: Math.min(1.2, Math.max(0.7, speed)) },
      }),
    });
  } else if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set");
    res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
        voice: voice ?? "coral",
        input,
        speed,
        response_format: "mp3",
        instructions: "Speak like a calm senior engineer walking a teammate through a plan.",
      }),
    });
  } else {
    throw new Error(`Unknown provider ${provider}`);
  }
  if (!res.ok) throw new Error(`${provider} returned ${res.status}`);
  return res.arrayBuffer();
}
