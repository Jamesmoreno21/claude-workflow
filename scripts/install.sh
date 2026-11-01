#!/usr/bin/env bash
# Builds the cockpit, links the /workflow skill and registers the MCP server
# with Claude Code (user scope, so it works in every repo).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS="${CLAUDE_HOME:-$HOME/.claude}/skills"

echo "→ Installing dependencies and building"
(cd "$ROOT" && npm install --silent && npm run build --silent)

echo "→ Linking skill into $SKILLS/workflow"
mkdir -p "$SKILLS"
ln -sfn "$ROOT/skill/workflow" "$SKILLS/workflow"

echo "→ Registering MCP server 'workflow'"
claude mcp remove workflow -s user >/dev/null 2>&1 || true
claude mcp add workflow -s user -e WORKFLOW_WAIT_MS=480000 -- node "$ROOT/server/dist/server/src/index.js"

echo "✓ Done. Start a new Claude Code session in your project and type /workflow"
