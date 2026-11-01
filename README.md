# claude-workflow

A `/workflow` skill for [Claude Code](https://claude.com/claude-code) that moves the conversation out of the terminal and into a local **cockpit** UI. You stay in charge of every decision and every file without having to read a wall of text.

```
/workflow ─▶ Context ─▶ Validation ─▶ Plan ─▶ Coding ─▶ Pre-review ─▶ Commits ─▶ Published
            (terminal)  product+tech   narrated  file by    agents +     PRs ≤1k
                        questions      slides    file       Fix/Dismiss  lines
```

1. **Context**: Claude says hi and asks for the task (ClickUp/GitHub link or text), the repos (to change, or for context only), designs and a style guide. Previous answers are remembered.
2. **Cockpit**: a local web app opens, with the task title, a phase stepper, and a ⚙ to edit the context at any time.
3. **Validation**: product questions, then technical ones. Each shows its full context, a "+" example, and 2–4 options plus free text. Answer with the keyboard (1–4), by clicking, or by voice.
4. **Plan**: narrated slides covering the feature, edge cases, implementation (with files and mermaid diagrams), tests, and how the work splits into PRs. Press ⌘P (or hold Space) to interrupt with a question. Claude answers and updates the slides.
5. **Coding**: each file's diff replays line by line, tagged with the part of the plan it implements. It types at a human pace: → / ← step a line (⇧ for a whole hunk), P pauses. Approve it (⌘⏎) or ask for changes before the next file starts; `[` `]` move between files, and `L` shows which architecture layer each file is in.
6. **Pre-review**: parallel reviewer agents check correctness, security, constraints and tests, and the style guide. Numbered findings appear inline, GitHub-style, with **Fix / Dismiss / Ask**.
7. **Commit history**: PRs (ideally ≤1000 lines) and commits (≤300 lines) per repo, with descriptions filled from the PR template, you as assignee, and the reviewers you pick. Then **Publish**.

## How it works

```
Claude Code session ◀──stdio MCP──▶ workflow server ◀──WebSocket──▶ browser UI
  thinks, edits, runs git/gh          state machine + memory            React
  reviewers = subagents               (~/.claude-workflow)              voice: Web Speech API
```

Claude Code stays the brain and uses your existing plan and permissions. The MCP server provides **waiting tools** (`workflow_ask`, `workflow_present_plan`, `workflow_file_ready`, …). Each one puts something on screen and returns when you act, whether you click or speak.

## Install

Requirements: Node 20.19+, 22.13+ or 24+, the Claude Code CLI, and `gh` (authenticated) for publishing.

```bash
git clone --branch v0.1.0 https://github.com/Jamesmoreno21/claude-workflow
cd claude-workflow
npm run install-skill
```

Pin to a release tag (see [Releases](https://github.com/Jamesmoreno21/claude-workflow/releases)) rather than `main`. To upgrade later: `git fetch --tags && git checkout vX.Y.Z && npm run install-skill`.

On a company machine, check that `huggingface.co` and `cdn.jsdelivr.net` are reachable if you want the default Kokoro voice (the system voice works offline), and that your Claude Code setup allows user-scoped MCP servers.

This builds the app, links the skill into `~/.claude/skills/workflow`, and registers the `workflow` MCP server at user scope. Open a new Claude Code session in your project and type `/workflow`.

### Voice

Press **⌘P / Ctrl+P** to talk and again to send (Esc cancels), or hold **Space**. Listening uses the browser's Web Speech API, so it works best in Chrome. The 🔊 button in the header picks the narration voice. Claude has no speech API, so narration comes from one of these:

| Voice                | Setup                                                        | Notes                                                                                                                                       |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kokoro** (default) | none                                                         | Open-source neural voice that runs in your browser, on the GPU when available. Free and private; about 90 MB downloaded once. English only. |
| ElevenLabs           | `export ELEVENLABS_API_KEY=…` before `npm run install-skill` | The most natural voice; multilingual. Optional `ELEVENLABS_VOICE_ID`.                                                                       |
| OpenAI               | `export OPENAI_API_KEY=…` before `npm run install-skill`     | `gpt-4o-mini-tts`; multilingual.                                                                                                            |
| System voice         | none                                                         | Instant, but robotic. Also used as the fallback whenever another voice fails.                                                               |

API keys stay in the MCP server's environment. The browser asks the local server for audio and never sees the keys.

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
skill/workflow/SKILL.md   the playbook Claude follows
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
  src/demo/               scripted fake Claude and its fixture task
web/src/
  App.tsx                 layout and phase → screen
  app/                    AppContext, focus
  config/settings.ts      user preferences (localStorage)
  constants/              labels, phases, shortcuts, replay timing, voices
  services/               socket, API, storage, speech recognition, tts/
  hooks/                  connection, push-to-talk, replay, hotkeys
  lib/                    diff rows and size classes (pure)
  components/             CodeView, Markdown, Diagram, Chat, Header, …
  screens/                one per phase: ValidationScreen, PlanScreen, …
e2e/                      Playwright spec
```

## License

MIT
