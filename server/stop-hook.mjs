import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// server/src/hooks/stop-decision.ts
import { execFileSync } from "node:child_process";

// shared/protocol.ts
var FINISHED_PHASES = ["published", "ended"];

// server/src/services/runtime.ts
import { existsSync as existsSync2, mkdirSync, readdirSync, readFileSync as readFileSync2, rmSync, writeFileSync } from "node:fs";
import { join as join3 } from "node:path";

// server/src/config/paths.ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";

// server/src/config/constants.ts
var MAX_SOCKET_MESSAGE_BYTES = 1024 * 1024;
var MEMORY_FILE = "memory.json";
var SESSIONS_DIR = "sessions";
var RUNTIME_DIR = "runtime";
var MAX_EDITOR_FILE_BYTES = 1024 * 1024;

// server/src/config/settings.ts
import { homedir } from "node:os";
import { join } from "node:path";

// shared/constants.ts
var DEFAULT_PORT = 4545;

// server/src/config/settings.ts
var env = (name) => process.env[name] || void 0;
var number = (name, fallback) => Number(env(name) ?? fallback) || fallback;
var settings = {
  /** First port tried for the cockpit; the next free one is used if taken. */
  get port() {
    return number("WORKFLOW_PORT", DEFAULT_PORT);
  },
  /** How long a waiting tool blocks before handing control back to Claude. */
  get waitMs() {
    return number("WORKFLOW_WAIT_MS", 8 * 6e4);
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
      }
    },
    openai: {
      get apiKey() {
        return env("OPENAI_API_KEY");
      },
      get model() {
        return env("OPENAI_TTS_MODEL") ?? "gpt-4o-mini-tts";
      }
    }
  }
};

// server/src/config/paths.ts
function findRepoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    const pkg = join2(dir, "package.json");
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, "utf8")).name === "claude-workflow") return dir;
    dir = dirname(dir);
  }
  return null;
}
var repoRoot = findRepoRoot();
var paths = {
  get webDist() {
    if (settings.webDist) return settings.webDist;
    if (!repoRoot) throw new Error("WORKFLOW_WEB_DIST is not set and no source checkout was found");
    return join2(repoRoot, "web", "dist");
  },
  get memoryFile() {
    return join2(settings.home, MEMORY_FILE);
  },
  get sessionsDir() {
    return join2(settings.home, SESSIONS_DIR);
  },
  /** One file per running cockpit, so the Stop hook can find this session's. */
  get runtimeDir() {
    return join2(settings.home, RUNTIME_DIR);
  }
};

// server/src/services/runtime.ts
var entryFile = (claudePid) => join3(paths.runtimeDir, `${claudePid}.json`);
var isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
function findRuntime(candidatePids) {
  if (!existsSync2(paths.runtimeDir)) return null;
  for (const pid of candidatePids) {
    const file = entryFile(pid);
    if (!existsSync2(file)) continue;
    const entry = JSON.parse(readFileSync2(file, "utf8"));
    if (isAlive(entry.serverPid)) return entry;
    rmSync(file, { force: true });
  }
  return null;
}
function liveRuntimes() {
  if (!existsSync2(paths.runtimeDir)) return [];
  return readdirSync(paths.runtimeDir).map((name) => Number(name.replace(/\.json$/, ""))).map((pid) => findRuntime([pid])).filter((entry) => entry !== null);
}

// server/src/hooks/stop-decision.ts
var MAX_ANCESTORS = 8;
function ancestorPids() {
  const pids = [];
  let pid = process.ppid;
  for (let i = 0; i < MAX_ANCESTORS && pid > 1; i++) {
    pids.push(pid);
    try {
      pid = Number(execFileSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" }).trim());
    } catch {
      break;
    }
  }
  return pids;
}
function thisSessionsCockpit() {
  const found = findRuntime(ancestorPids());
  if (found) return found;
  const live = liveRuntimes();
  return live.length === 1 ? live[0] : null;
}
function stopHookOutput(cockpit) {
  if (!cockpit || FINISHED_PHASES.includes(cockpit.phase)) return null;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: `The workflow cockpit (${cockpit.url}) is still open in phase "${cockpit.phase}", and the user works there, not in the terminal. Call workflow_wait to receive their next action. If the user asked in the terminal to stop the workflow, call workflow_end instead.`
    }
  });
}

// server/src/hooks/stop.ts
try {
  const output = stopHookOutput(thisSessionsCockpit());
  if (output) process.stdout.write(output);
} catch (err) {
  console.error("[workflow] stop hook:", err);
}
