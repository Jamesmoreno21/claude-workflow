// Pure values only: the Kokoro worker imports this file and has no DOM.

export type TtsProvider = "kokoro" | "browser" | "elevenlabs" | "openai";

export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

export const VOICES: Partial<Record<TtsProvider, { id: string; label: string }[]>> = {
  kokoro: [
    { id: "af_heart", label: "Heart (US, warm)" },
    { id: "af_bella", label: "Bella (US)" },
    { id: "am_michael", label: "Michael (US)" },
    { id: "am_fenrir", label: "Fenrir (US)" },
    { id: "bf_emma", label: "Emma (UK)" },
    { id: "bm_george", label: "George (UK)" },
  ],
  openai: ["coral", "alloy", "ash", "ballad", "echo", "fable", "nova", "onyx", "sage", "shimmer"].map((id) => ({ id, label: id })),
};

export const PROVIDER_INFO: { id: TtsProvider; label: string; hint: string }[] = [
  { id: "kokoro", label: "Kokoro", hint: "Neural voice in your browser. Free and private; ~90 MB one-time download. English only." },
  { id: "elevenlabs", label: "ElevenLabs", hint: "Most natural and multilingual. Needs ELEVENLABS_API_KEY in the MCP server env." },
  { id: "openai", label: "OpenAI", hint: "Natural and multilingual. Needs OPENAI_API_KEY in the MCP server env." },
  { id: "browser", label: "System voice", hint: "Your OS voice. Instant, but robotic." },
];

export const NARRATION_SPEED = { min: 0.8, max: 1.4, step: 0.05 };
export const SAMPLE_NARRATION =
  "Here's the plan. We'll add a limiter in front of the login route, and lock the account after five failed attempts.";

/** System voices that sound least robotic, by name. */
export const PREFERRED_SYSTEM_VOICE = /natural|premium|enhanced|siri|google/i;
/** Small lead so back-to-back sentences don't click. */
export const AUDIO_LEAD_SECONDS = 0.05;
