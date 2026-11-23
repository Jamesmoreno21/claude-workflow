import { useSyncExternalStore } from "react";
import { CODE_APPROVALS, type CodeApproval, type PublishMode } from "../../../shared/protocol";
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
  finishMode: PublishMode;
  replaySpeed: number;
  /** Type each file's diff out line by line; off shows the whole change at once. */
  replayCode: boolean;
  showLayers: boolean;
  /** How code is approved unless the user picks otherwise. */
  codeApproval: CodeApproval;
  /** Ask how to approve the code when approving the plan; off uses codeApproval as is. */
  askCodeApproval: boolean;
}

export const STORAGE_KEYS: Record<keyof Preferences, string> = {
  narration: "wf.tts",
  finishMode: "wf.finish",
  replaySpeed: "wf.speed",
  replayCode: "wf.replay",
  showLayers: "wf.layers",
  codeApproval: "wf.approval",
  askCodeApproval: "wf.askApproval",
};

const DEFAULTS: Preferences = {
  narration: { provider: "kokoro", muted: false, speed: 1.05, voices: {} },
  finishMode: "pr",
  replaySpeed: 1,
  replayCode: true,
  showLayers: false,
  codeApproval: "every",
  askCodeApproval: true,
};

const oneOf = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

let current: Preferences = {
  narration: { ...DEFAULTS.narration, ...readJson(STORAGE_KEYS.narration, {}) },
  finishMode: readJson(STORAGE_KEYS.finishMode, DEFAULTS.finishMode),
  replaySpeed: Number(readJson(STORAGE_KEYS.replaySpeed, DEFAULTS.replaySpeed)) || DEFAULTS.replaySpeed,
  replayCode: readJson(STORAGE_KEYS.replayCode, DEFAULTS.replayCode) !== false,
  showLayers: Boolean(readJson(STORAGE_KEYS.showLayers, DEFAULTS.showLayers)),
  codeApproval: oneOf(CODE_APPROVALS, readJson(STORAGE_KEYS.codeApproval, DEFAULTS.codeApproval), DEFAULTS.codeApproval),
  askCodeApproval: readJson(STORAGE_KEYS.askCodeApproval, DEFAULTS.askCodeApproval) !== false,
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
