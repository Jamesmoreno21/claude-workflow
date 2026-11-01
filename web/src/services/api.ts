import { ROUTES } from "../../../shared/constants";
import type { TtsAvailability, TtsRequest } from "../../../shared/tts";

export async function getTtsAvailability(): Promise<TtsAvailability | null> {
  try {
    const res = await fetch(ROUTES.ttsProviders);
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

/** MP3 narration from a hosted provider, through the local server. */
export async function synthesize(request: TtsRequest, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(ROUTES.tts, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.arrayBuffer();
}
