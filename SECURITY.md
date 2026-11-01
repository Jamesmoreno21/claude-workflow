# Security

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/Jamesmoreno21/claude-workflow/security/advisories/new), not public issues. You'll get a reply within a week.

## What this project protects against

The cockpit runs on your machine and can approve code changes and publish pull requests on your behalf, so its main risks are:

| Risk                                                    | Mitigation                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Another website driving the cockpit through `localhost` | Origin and Host checks on HTTP and WebSocket; loopback-only listener                    |
| Script injection through task text (issues, cards)      | Markdown sanitized with DOMPurify, safe link schemes only, Content-Security-Policy      |
| Prompt injection in task text                           | The skill treats fetched content as data; publishing only happens on the user's Publish |
| Reading files outside the task                          | Tool paths are confined to the selected repositories                                    |
| Leaking task content on disk                            | Memory and session snapshots are written owner-only (`0600`)                            |
| Leaking TTS API keys                                    | Keys stay in the MCP server's environment; the browser never receives them              |

## Known limitations

- `claude mcp add -e` stores optional TTS keys in plain text in `~/.claude.json`.
- The Kokoro voice model and ONNX runtime are downloaded from Hugging Face and jsDelivr on first use.
