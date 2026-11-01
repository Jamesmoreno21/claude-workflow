import { PREFERRED_SYSTEM_VOICE } from "../../constants/tts";

const supported = () => "speechSynthesis" in window;

function systemVoice() {
  const lang = navigator.language.slice(0, 2);
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith(lang));
  return voices.find((v) => PREFERRED_SYSTEM_VOICE.test(v.name)) ?? voices[0];
}

/** The OS voice: instant and always available, so it's also the fallback. */
export function speakWithSystemVoice(text: string, speed: number): Promise<void> {
  if (!supported()) return Promise.resolve();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = systemVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = speed;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.speak(utterance);
  });
}

export const stopSystemVoice = () => supported() && speechSynthesis.cancel();
