import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PORT } from "../../../shared/constants.js";

// Every environment variable the server reads. Getters, not values: the demo
// and tests set some of these after the modules have loaded.

const env = (name: string) => process.env[name] || undefined;
const number = (name: string, fallback: number) => Number(env(name) ?? fallback) || fallback;

export const settings = {
  /** First port tried for the cockpit; the next free one is used if taken. */
  get port() {
    return number("WORKFLOW_PORT", DEFAULT_PORT);
  },
  /** How long a waiting tool blocks before handing control back to Claude. */
  get waitMs() {
    return number("WORKFLOW_WAIT_MS", 8 * 60_000);
  },
  /** Where memory and session snapshots are stored. */
  get home() {
    return env("WORKFLOW_HOME") ?? join(homedir(), ".claude-workflow");
  },
  /** The built UI; the plugin sets it, a source checkout finds web/dist itself. */
  get webDist() {
    return env("WORKFLOW_WEB_DIST");
  },
  /** Set by the plugin build; a source checkout reads server/package.json. */
  get version() {
    return env("WORKFLOW_VERSION");
  },
  /** Extra origin allowed while developing the UI (e.g. Vite on :5173). */
  get devOrigin() {
    return env("WORKFLOW_DEV_ORIGIN");
  },
  /** Multiplier for the demo's pauses; 0.1 runs it 10× faster. */
  get demoSpeed() {
    return number("DEMO_SPEED", 1);
  },
  tts: {
    elevenlabs: {
      get apiKey() {
        return env("ELEVENLABS_API_KEY");
      },
      get voiceId() {
        return env("ELEVENLABS_VOICE_ID") ?? "21m00Tcm4TlvDq8ikWAM";
      },
      get model() {
        return env("ELEVENLABS_MODEL") ?? "eleven_multilingual_v2";
      },
    },
    openai: {
      get apiKey() {
        return env("OPENAI_API_KEY");
      },
      get model() {
        return env("OPENAI_TTS_MODEL") ?? "gpt-4o-mini-tts";
      },
    },
  },
};
