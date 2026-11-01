import { AUDIO_LEAD_SECONDS } from "../../constants/tts";

// Gapless playback of audio chunks through Web Audio.

let context: AudioContext | null = null;
let playhead = 0;
const playing = new Set<AudioBufferSourceNode>();

export function audioContext() {
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

// Browsers only allow audio after a user gesture; unlock on the first one.
const unlock = () => "AudioContext" in window && audioContext();
window.addEventListener("pointerdown", unlock, { once: true, capture: true });
window.addEventListener("keydown", unlock, { once: true, capture: true });

/** Plays `buffer` right after whatever is queued; resolves when it ends or is stopped. */
export function enqueue(buffer: AudioBuffer): Promise<void> {
  const ctx = audioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  playhead = Math.max(playhead, ctx.currentTime + AUDIO_LEAD_SECONDS);
  source.start(playhead);
  playhead += buffer.duration;
  playing.add(source);
  return new Promise((resolve) => {
    source.onended = () => {
      playing.delete(source);
      resolve();
    };
  });
}

export function pcmBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
  const buffer = audioContext().createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  return buffer;
}

/** Stops everything queued. stop() fires `ended`, settling the enqueue promises. */
export function stopAudio() {
  for (const source of playing) source.stop();
  playing.clear();
  playhead = 0;
}
