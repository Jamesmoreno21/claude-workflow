export const MCP_SERVER_NAME = "workflow";

/** The cockpit only listens on loopback. */
export const BIND_HOST = "127.0.0.1";
export const PORT_SCAN_RANGE = 50;
export const MAX_SOCKET_MESSAGE_BYTES = 1024 * 1024;

export const MEMORY_FILE = "memory.json";
export const SESSIONS_DIR = "sessions";
export const RUNTIME_DIR = "runtime";
export const SESSION_SAVE_DEBOUNCE_MS = 500;
export const MEMORY_LIMITS = { repos: 30, styleGuides: 15, reviewers: 30, styleGuideName: 60 };

/** Editor limits: bigger files open as "too large", and huge repos list this many files. */
export const MAX_EDITOR_FILE_BYTES = 1024 * 1024;
export const MAX_TREE_FILES = 20_000;

export const RUN_ID_LENGTH = 8;
export const INITIAL_STATUS = "Reading the task and repositories…";

export const TTS_MAX_CHARS = 5000;
export const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
export const ELEVENLABS_SPEED_RANGE = [0.7, 1.2] as const;
export const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";
export const OPENAI_DEFAULT_VOICE = "coral";
export const OPENAI_TTS_INSTRUCTIONS = "Speak like a calm senior engineer walking a teammate through a plan.";

export const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
};
