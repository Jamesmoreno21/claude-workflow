# claude-workflow

A [Claude Code](https://claude.com/claude-code) plugin that moves the conversation out of the terminal and into a local **cockpit** UI. You stay in charge of every decision and every file without having to read a wall of text.

```
/workflow:start ─▶ Context ─▶ Validation ─▶ Plan ─▶ Coding ─▶ Pre-review ─▶ Commits ─▶ Published
            (terminal)  product+tech   narrated  file by    agents +     PRs ≤1k
                        questions      slides    file       Fix/Dismiss  lines
```

1. **Context**: Claude says hi and asks for the task (ClickUp/GitHub link or text), the repos (to change, or for context only), designs and a style guide. Previous answers are remembered.
2. **Cockpit**: a local web app opens, with the task title, a phase stepper, and a ⚙ to edit the context at any time.
3. **Validation**: product questions, then technical ones. Each shows its full context, a "+" example, and 2–4 options plus free text. Answer with the keyboard (1–4), by clicking, or by voice.
4. **Plan**: narrated slides covering the feature, edge cases, implementation (with files and mermaid diagrams), tests, and how the work splits into PRs. Press ⌘P (or hold Space) to interrupt with a question. Claude answers and updates the slides.
5. **Coding**, in a real code editor (Monaco, the engine behind VS Code): each file's diff types itself out at a human pace, tagged with the part of the plan it implements (→ / ← step a line, ⇧ a hunk, P pauses). Edit any file yourself and save (⌘S); Claude is told and builds on your version. Select code to ask about exactly those lines. Browse the whole repository, or only the changed files. Approve each file (⌘⏎) before the next one starts; `L` shows which architecture layer each file is in.
6. **Pre-review**, in the same editor: parallel reviewer agents check correctness, security, constraints and tests, and the style guide. Numbered findings appear between the code lines, GitHub-style, with **Fix / Dismiss / Ask**; a fix opens as a diff to approve.
7. **Commit history**: PRs (ideally ≤1000 lines) and commits (≤300 lines) per repo, with descriptions filled from the PR template. Finish by **committing locally**, **pushing the branches**, or **pushing and opening PRs** with you as assignee and the reviewers you pick.

While Claude works on something you sent, a loader says what it's doing. If Claude doesn't pick it up within 25 seconds, the cockpit tells you to look at the terminal.

## How it works

```
Claude Code session ◀──stdio MCP──▶ workflow server ◀──WebSocket──▶ browser UI
  thinks, edits, runs git/gh          state machine + memory            React
  reviewers = subagents               (~/.claude-workflow)              voice: Web Speech API
```

Claude Code stays the brain and uses your existing plan and permissions. The MCP server provides **waiting tools** (`workflow_ask`, `workflow_present_plan`, `workflow_file_ready`, …). Each one puts something on screen and returns when you act, whether you click or speak.

A **Stop hook** keeps Claude listening: while this session's cockpit is open, Claude is reminded to wait for you instead of ending its turn, so answers you give in the browser are never left unread. End a workflow early from the ⚙ panel. If your Claude Code has [channels](https://code.claude.com/docs/en/channels) enabled, the server can also wake an idle session the moment you act; this is optional.

## Install

Requirements: Claude Code, Node 20.19+, 22.13+ or 24+ on your `PATH`, and `gh` (authenticated) to push or open PRs.

```bash
claude plugin marketplace add Jamesmoreno21/claude-workflow
```

```bash
claude plugin install workflow@jamesmoreno21
```

Start a new Claude Code session in your project and type `/workflow:start` (or ask Claude to "start a task with the workflow"). Nothing is built on your machine: the plugin is published prebuilt to the `plugin` branch by each release. Update with `claude plugin update workflow@jamesmoreno21`.

**Coming from v0.1** (installed with `install.sh`)? Remove the old setup first:

```bash
claude mcp remove workflow -s user; rm -f ~/.claude/skills/workflow
```

On a company machine, check that `huggingface.co` is reachable if you want the default Kokoro voice (the system voice works offline), and that your organization allows installing plugins from GitHub marketplaces.

### Voice

Press **⌘P / Ctrl+P** to talk and again to send (Esc cancels), or hold **Space**. Listening uses the browser's Web Speech API, so it works best in Chrome. The 🔊 button in the header picks the narration voice. Claude has no speech API, so narration comes from one of these:

| Voice                | Setup                                                  | Notes                                                                                                                                       |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kokoro** (default) | none                                                   | Open-source neural voice that runs in your browser, on the GPU when available. Free and private; about 90 MB downloaded once. English only. |
| ElevenLabs           | `export ELEVENLABS_API_KEY=…` before starting `claude` | The most natural voice; multilingual. Optional `ELEVENLABS_VOICE_ID`.                                                                       |
| OpenAI               | `export OPENAI_API_KEY=…` before starting `claude`     | `gpt-4o-mini-tts`; multilingual.                                                                                                            |
| System voice         | none                                                   | Instant, but robotic. Also used as the fallback whenever another voice fails.                                                               |

API keys stay in the MCP server's environment (it inherits Claude Code's). The browser asks the local server for audio and never sees the keys.

## Security

The cockpit can approve code and publish PRs, so it only accepts its own origin: other websites can't drive it over the WebSocket or read its state (DNS rebinding included), and it listens on `127.0.0.1` only. Markdown from task descriptions is sanitized, the UI ships a Content-Security-Policy, file paths are confined to the selected repos, and memory and session files are owner-only. The skill treats task text as data, not instructions, and nothing is pushed until you press **Publish**. See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Develop

```bash
npm install
npm run demo                 # build, then run a scripted fake Claude through every phase
npm test                     # Vitest unit and component tests
npm run test:e2e             # Playwright: the demo end to end (run `npx playwright install chromium` once)
npm run lint                 # ESLint + Prettier check (`npm run format` fixes)
npm run typecheck
```

For UI work with hot reload, run `npm run demo:dev` and `npm run dev:web` in two terminals, then open http://localhost:5173.

To try your local build in Claude Code: `npm run build:plugin`, then `claude --plugin-dir dist/plugin`.

CI runs lint, typecheck, unit tests (Node 22 and 24) and the e2e on every push and PR. Dependencies are pinned to patch ranges (`~x.y.z`); Dependabot proposes updates weekly.

### Versioning

[Semantic Versioning](https://semver.org), with every change noted under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md). To cut a release:

```bash
npm run release -- patch    # or minor, major, or an exact X.Y.Z
git push --follow-tags
```

The script bumps all packages together, dates the changelog, runs lint, typecheck and tests, then commits and tags `vX.Y.Z`. Pushing the tag publishes a GitHub release with those notes. The MCP server reports its version at startup.

### Layout

```
plugin/                   the installable plugin's static files
  skills/start/SKILL.md   the playbook Claude follows (/workflow:start)
  .mcp.json, hooks/       the MCP server and the Stop hook
.claude-plugin/           marketplace.json, pointing at the built plugin branch
scripts/build-plugin.mjs  bundles server + UI into dist/plugin
shared/                   types and constants used by both server and UI
  protocol.ts             state, events, enums
  constants.ts            PR/commit size limits, port, routes
  tts.ts                  narration request contract
server/
  bin/                    stable entry points: mcp.js, demo.js
  src/index.ts            MCP server entry
  src/config/             settings (every env var), constants, paths
  src/mcp/                tool registration, input schemas, result hints
  src/core/               Workflow operations and the Store (state, events, waiting)
  src/services/           git, memory, TTS proxy, browser
  src/http/               cockpit server, static files, origin/host checks + CSP
  src/hooks/              the Stop hook
  src/demo/               scripted fake Claude and its fixture task
web/src/
  App.tsx                 layout and phase → screen
  app/                    AppContext, focus
  config/settings.ts      user preferences (localStorage)
  constants/              labels, phases, shortcuts, replay timing, voices
  services/               socket, API, files, storage, speech recognition, tts/
  hooks/                  connection, push-to-talk, replay, hotkeys
  lib/                    diff rows and size classes (pure)
  components/             editor/ (Monaco), FileTree, Markdown, Diagram, Chat, Header, …
  screens/                one per phase; workspace/ is the code editor for coding and review
e2e/                      Playwright spec
```

## License

MIT
