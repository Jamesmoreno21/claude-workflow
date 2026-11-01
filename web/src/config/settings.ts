import { useSyncExternalStore } from "react";
import type { TtsProvider } from "../constants/tts";
import { readJson, writeJson } from "../services/storage";

// The user's preferences, persisted in this browser.

export interface NarrationPreferences {
  provider: TtsProvider;
  muted: boolean;
  speed: number;
  voices: Partial<Record<TtsProvider, string>>;
}

export interface Preferences {
  narration: NarrationPreferences;
  replaySpeed: number;
  showLayers: boolean;
}

export const STORAGE_KEYS: Record<keyof Preferences, string> = {
  narration: "wf.tts",
  replaySpeed: "wf.speed",
  showLayers: "wf.layers",
};

const DEFAULTS: Preferences = {
  narration: { provider: "kokoro", muted: false, speed: 1.05, voices: {} },
  replaySpeed: 1,
  showLayers: false,
};

let current: Preferences = {
  narration: { ...DEFAULTS.narration, ...readJson(STORAGE_KEYS.narration, {}) },
  replaySpeed: Number(readJson(STORAGE_KEYS.replaySpeed, DEFAULTS.replaySpeed)) || DEFAULTS.replaySpeed,
  showLayers: Boolean(readJson(STORAGE_KEYS.showLayers, DEFAULTS.showLayers)),
};
const listeners = new Set<() => void>();

export const getPreference = <K extends keyof Preferences>(key: K): Preferences[K] => current[key];

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  current = { ...current, [key]: value };
  writeJson(STORAGE_KEYS[key], value);
  listeners.forEach((notify) => notify());
}

export function usePreference<K extends keyof Preferences>(key: K): [Preferences[K], (value: Preferences[K]) => void] {
  const value = useSyncExternalStore(
    (notify) => (listeners.add(notify), () => listeners.delete(notify)),
    () => current[key],
  );
  return [value, (next) => setPreference(key, next)];
}
