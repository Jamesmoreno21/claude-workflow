// stdio MCP server. Claude Code launches it at session start; the cockpit UI
// only comes up when /workflow calls workflow_start.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MCP_SERVER_NAME } from "./config/constants.js";
import { appVersion } from "./config/paths.js";
import { Workflow } from "./core/workflow.js";
import { registerTools } from "./mcp/tools.js";

const version = appVersion();

// The channel capability lets the server wake an idle session when the user acts
// in the cockpit. Claude Code only honors it when channels are enabled; otherwise
// the Stop hook keeps Claude listening and the pings are silently dropped.
const mcp = new McpServer(
  { name: MCP_SERVER_NAME, version },
  {
    capabilities: { experimental: { "claude/channel": {} } },
    instructions:
      'Messages from the workflow cockpit arrive as <channel source="workflow">. They mean the user acted in the browser: call workflow_wait to receive their events.',
  },
);

const pingClaude = () =>
  void mcp.server
    .notification({
      method: "notifications/claude/channel",
      params: { content: "The user acted in the workflow cockpit. Call workflow_wait to receive what they did." },
    } as never)
    .catch(() => {});

registerTools(mcp, new Workflow({ onUserActsWhileClaudeIdle: pingClaude }));
await mcp.connect(new StdioServerTransport());
console.error(`[workflow] MCP server ${version} ready`);

// The cockpit's HTTP server would keep this process alive after Claude Code
// exits; leave with the session instead (this also clears the runtime entry).
const exit = () => process.exit(0);
process.stdin.on("end", exit);
process.stdin.on("close", exit);
process.on("SIGTERM", exit);
process.on("SIGINT", exit);
