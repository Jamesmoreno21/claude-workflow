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
4. **Plan**: narrated slides covering the feature, edge cases, implementation (with files and mermaid diagrams), tests, and how the work splits into PRs. Hold Space to interrupt with a question. Claude answers and updates the slides.
5. **Coding**: each file's diff replays line by line, tagged with the part of the plan it implements. Approve it (⌘⏎) or ask for changes before the next file starts. ← → moves back through earlier files.
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

Requirements: Node 20 or later, the Claude Code CLI, and `gh` (authenticated) for publishing.

```bash
git clone https://github.com/Jamesmoreno21/claude-workflow
cd claude-workflow
npm run install-skill
```

This builds the app, links the skill into `~/.claude/skills/workflow`, and registers the `workflow` MCP server at user scope. Open a new Claude Code session in your project and type `/workflow`.

### Voice

Hold **Space** to talk; listening uses the browser's Web Speech API, so it works best in Chrome. The 🔊 button in the header picks the narration voice. Claude has no speech API, so narration comes from one of these:

| Voice | Setup | Notes |
| --- | --- | --- |
| **Kokoro** (default) | none | Open-source neural voice that runs in your browser, on the GPU when available. Free and private; about 90 MB downloaded once. English only. |
| ElevenLabs | `export ELEVENLABS_API_KEY=…` before `npm run install-skill` | The most natural voice; multilingual. Optional `ELEVENLABS_VOICE_ID`. |
| OpenAI | `export OPENAI_API_KEY=…` before `npm run install-skill` | `gpt-4o-mini-tts`; multilingual. |
| System voice | none | Instant, but robotic. Also used as the fallback whenever another voice fails. |

API keys stay in the MCP server's environment. The browser asks the local server for audio and never sees the keys.

## Develop

```bash
npm install
npm run demo                 # builds, then runs a scripted fake Claude through every phase
npm run dev:web              # Vite with hot reload, proxied to the demo on :4545
```

```bash
npm test                     # Vitest: server state/waiting/git + UI replay, validation, PR editing
npm run test:e2e             # Playwright: drives the demo through all seven phases
```

Run `npx playwright install chromium` once before the first e2e run. Dependencies are pinned to patch ranges (`~x.y.z`), and `.npmrc` keeps new ones pinned the same way.

| Path | What |
| --- | --- |
| `skill/workflow/SKILL.md` | The playbook Claude follows |
| `shared/protocol.ts` | State and event types shared by server and UI |
| `server/src/index.ts` | MCP tools (stdio) |
| `server/src/workflow.ts` | Operations behind the tools |
| `server/src/store.ts` | State, event queue, waiting |
| `server/src/demo.ts` | Scripted run for UI work |
| `web/src/screens/*` | One screen per phase |
| `web/src/tts/*` | Narration: Kokoro worker, providers, playback |
| `e2e/workflow.spec.ts` | End-to-end run through every phase |

## License

MIT
