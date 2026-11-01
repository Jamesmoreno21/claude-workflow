// stdio MCP server. Claude Code launches it at session start; the cockpit UI
// only comes up when /workflow calls workflow_start.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { MCP_SERVER_NAME } from "./config/constants.js";
import { paths } from "./config/paths.js";
import { Workflow } from "./core/workflow.js";
import { registerTools } from "./mcp/tools.js";

const { version } = JSON.parse(readFileSync(paths.serverPackage, "utf8"));
const mcp = new McpServer({ name: MCP_SERVER_NAME, version });

registerTools(mcp, new Workflow());
await mcp.connect(new StdioServerTransport());
console.error(`[workflow] MCP server ${version} ready`);
