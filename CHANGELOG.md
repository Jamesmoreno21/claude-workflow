# Changelog

All notable changes are listed here. The project follows [Semantic Versioning](https://semver.org): while in `0.x`, minor versions may change the MCP tools or the skill in incompatible ways.

## [Unreleased]

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
