# Changelog

All notable changes are listed here. The project follows [Semantic Versioning](https://semver.org): while in `0.x`, minor versions may change the MCP tools or the skill in incompatible ways.

## [Unreleased]

### Added

- Ships as a Claude Code plugin: `claude plugin marketplace add Jamesmoreno21/claude-workflow`, then `claude plugin install workflow@jamesmoreno21`. The command is now `/workflow:start`.
- A real code editor (Monaco) for coding and pre-review: replay inside the diff, edit and save files (Claude is told), ask about a selection, browse the whole repository or only changed files, inline or side-by-side diffs.
- Pre-review findings inside the editor, between the code lines; a fix opens as a diff to approve.
- Finish by committing locally, pushing branches, or pushing and opening PRs.
- Add and remove repositories from the ⚙ panel; end the workflow from there.
- A loader while Claude works on what you sent, with a hint when it doesn't pick it up.
- "Typing on/off" in the editor: turn off the line-by-line replay to see each file's whole change at once.
- Click a plan diagram to view it full screen, with zoom.
- Read the decisions and the plan again from the header once you've moved on (read only).

### Fixed

- Claude no longer loses the cockpit: a Stop hook keeps it listening while the workflow is open, and an optional channel wakes an idle session.
- Starting a second workflow in the same session no longer shows the previous task's questions, answers or files.
- Shortcuts and push-to-talk no longer fire while typing in the editor.
- Faster Kokoro narration: the voice model loads and warms up when the cockpit opens, runs on several CPU threads, speaks short phrases so audio starts sooner, and prepares the next slide while the current one plays.
- Sent answers can no longer be changed while Claude reads them.
- The MCP server exits with its Claude Code session instead of lingering.
- Slow folders (for example ones macOS asks permission for) no longer freeze the cockpit.

### Removed

- `install.sh` and `npm run install-skill`; install the plugin instead.

## [0.1.0] - 2026-11-01

First release.

### Added

- `/workflow` skill: collects the task, repos, designs and style guide, then drives the whole task through a local cockpit UI.
- Cockpit phases: validation (product, then technical questions), narrated plan slides with diagrams, file-by-file coding with a human-paced diff replay and approvals, pre-review with inline findings (Fix / Dismiss / Ask), commit history with editable PRs and commits, and publishing.
- Voice: ⌘P / Ctrl+P or hold Space to talk on any screen; narration with Kokoro (in-browser, free), ElevenLabs or OpenAI, with the system voice as fallback.
- Memory of repos, style guides and reviewers between runs.
- Security: same-origin and host checks, sanitized Markdown, Content-Security-Policy, repo-confined file paths, owner-only memory files.
- Tests (Vitest and Playwright), ESLint and Prettier, and CI for lint, typecheck, tests and e2e.

[Unreleased]: https://github.com/Jamesmoreno21/claude-workflow/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Jamesmoreno21/claude-workflow/releases/tag/v0.1.0
