#!/usr/bin/env node
// stdio MCP server. Claude Code launches it at session start; the web UI only
// comes up when /workflow calls workflow_start.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { UserEvent } from "../../shared/protocol.js";
import { loadMemory } from "./memory.js";
import { Workflow } from "./workflow.js";

const wf = new Workflow();
const mcp = new McpServer({ name: "workflow", version: "0.1.0" });

const NEXT: Partial<Record<UserEvent["type"], string>> = {
  chat: "Answer with workflow_reply (short, spoken-friendly), act on it if it asks for a change, then call workflow_wait.",
  answers: "If every question is answered, move on (technical questions, then the plan).",
  plan_approved: "Plan approved. Start coding: workflow_begin_file for the first file.",
  file_feedback: "Rework that file, then call workflow_file_ready again.",
  file_approved: "Move to the next file in the plan (or workflow_code_ready if all are done).",
  start_review: "Launch the reviewer subagents, then call workflow_review with their findings.",
  finding_fix: "Fix that finding in the code, then call workflow_fix_ready with its id.",
  fix_rejected: "Rework the fix (see the note), then call workflow_fix_ready again.",
  history_changed: "Revise the proposal and call workflow_propose_history again.",
  publish: "Create branches, commits and PRs exactly as proposed, then call workflow_published.",
  context_changed: "The user edited the task context in the gear panel. Re-read it and adjust.",
};

function result(events: UserEvent[], extra?: Record<string, unknown>) {
  const hints = [...new Set(events.map((e) => NEXT[e.type]).filter(Boolean))];
  const payload = events.length
    ? { events, next: hints, ...extra }
    : { events: [], next: ["The user is still working. Call workflow_wait to keep waiting."], ...extra };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });

/* ---------- Schemas ---------- */

const repo = z.object({
  path: z.string().describe("Absolute path to the local checkout"),
  name: z.string().describe("Short name used in every other tool call"),
  role: z.enum(["change", "context"]).describe("'context' repos are read only"),
});

const option = z.object({
  id: z.string(),
  label: z.string().describe("2-6 words"),
  description: z.string().optional().describe("One sentence on the consequence"),
  example: z.string().optional().describe("Concrete scenario showing what this option means in practice"),
});

const question = z.object({
  id: z.string(),
  stage: z.enum(["product", "technical"]),
  title: z.string().describe("The question, one line"),
  context: z.string().describe("Markdown. Everything needed to decide without reading the terminal: what the task says, what's missing, why it matters"),
  example: z.string().optional().describe("Markdown. A worked example of the condition being decided"),
  options: z.array(option).min(2).max(4),
  recommended: z.string().optional().describe("Option id you would pick"),
});

const slide = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["overview", "feature", "edge_cases", "implementation", "tests", "prs"]),
  narration: z.string().describe("What you say out loud: 2-5 conversational sentences, no markdown"),
  body: z.string().describe("Markdown shown on the slide. Bullets, not paragraphs"),
  diagram: z.string().optional().describe("Mermaid source (flowchart/sequenceDiagram/erDiagram)"),
  files: z.array(z.object({ repo: z.string(), path: z.string(), note: z.string().optional() })).optional(),
  tests: z.array(z.string()).optional(),
});

const finding = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum(["bug", "security", "constraint", "style", "test", "perf", "other"]),
  repo: z.string(),
  path: z.string(),
  line: z.number().int().describe("1-based line in the current file"),
  title: z.string(),
  body: z.string().describe("Markdown: what is wrong and the concrete failure scenario"),
  suggestion: z.string().optional(),
  source: z.string().optional().describe("Which reviewer raised it"),
});

const commit = z.object({
  message: z.string(),
  files: z.array(z.string()),
  added: z.number().int(),
  removed: z.number().int(),
});

const pr = z.object({
  id: z.string(),
  repo: z.string(),
  branch: z.string(),
  base: z.string(),
  title: z.string(),
  body: z.string().describe("Filled from the repo's PR template when one exists"),
  commits: z.array(commit),
  dependsOn: z.string().optional().describe("id of the PR this one stacks on"),
});

/* ---------- Tools ---------- */

mcp.registerTool(
  "workflow_memory",
  { description: "Saved repos, style guides and reviewers from previous /workflow runs. Use in step 1 to offer quick picks." },
  async () => ok(JSON.stringify(loadMemory(), null, 2)),
);

mcp.registerTool(
  "workflow_start",
  {
    description: "Open the cockpit UI in the browser with the collected context. Shows a loading screen until you send questions.",
    inputSchema: {
      title: z.string().describe("Short task title for the header"),
      task: z.string().describe("Full task description (fetched from the link if one was given)"),
      taskUrl: z.string().optional(),
      repos: z.array(repo).min(1),
      design: z.string().optional().describe("Design link(s) or notes"),
      styleGuide: z.string().optional().describe("Style guide text or path"),
    },
  },
  async (ctx) => ok(`Cockpit open at ${await wf.start(ctx)}. Research the task now, reporting progress with workflow_status.`),
);

mcp.registerTool(
  "workflow_context",
  { description: "Current task context (the user can edit it from the gear icon at any time) plus any pending user events." },
  async () => ok(JSON.stringify(wf.context(), null, 2)),
);

mcp.registerTool(
  "workflow_status",
  {
    description: "Update the loading screen while you research, plan or publish. Short, present tense: 'Reading the billing module…'. Returns pending user events without waiting.",
    inputSchema: {
      message: z.string(),
      phase: z.enum(["research", "planning", "publishing"]).optional(),
    },
  },
  async ({ message, phase }) => result(wf.status(message, phase)),
);

mcp.registerTool(
  "workflow_ask",
  {
    description:
      "Show validation questions and wait for answers. Send all PRODUCT questions first; once answered, send the TECHNICAL ones. Questions with an existing id are replaced. Voice answers arrive as chat events: map them with workflow_reply(setAnswers).",
    inputSchema: { questions: z.array(question).min(1) },
  },
  async ({ questions }) => result(await wf.ask(questions)),
);

mcp.registerTool(
  "workflow_present_plan",
  {
    description:
      "Show the plan as narrated slides and wait. Order: overview, feature behaviour, edge cases, implementation (one slide per area, with files and a diagram), tests, PR split (aim <=1000 lines per PR, never >1500). Returns on approval or when the user interrupts with a question; if the answer changes the plan, call this again with updated slides.",
    inputSchema: {
      slides: z.array(slide).min(1),
      prs: z.array(z.object({ repo: z.string(), title: z.string(), estimatedLines: z.number().int(), scope: z.string() })),
    },
  },
  async (plan) => result(await wf.presentPlan(plan)),
);

mcp.registerTool(
  "workflow_begin_file",
  {
    description: "Announce the file you are about to write, and which plan slide it implements. Then edit it with your normal tools, then call workflow_file_ready.",
    inputSchema: {
      repo: z.string(),
      path: z.string().describe("Path relative to the repo root"),
      planRef: z.string().optional().describe("Slide id"),
      intent: z.string().optional().describe("One line: what changes in this file"),
    },
  },
  async ({ repo, path, planRef, intent }) => result(wf.beginFile(repo, path, planRef, intent)),
);

mcp.registerTool(
  "workflow_file_ready",
  {
    description: "The file is written. The UI replays the diff line by line and waits for the user to approve it or give feedback. Do not start the next file before approval.",
    inputSchema: { repo: z.string(), path: z.string() },
  },
  async ({ repo, path }) => result(await wf.fileReady(repo, path)),
);

mcp.registerTool(
  "workflow_code_ready",
  {
    description: "All files approved. Show the summary screen and wait for the user to start the pre-review.",
    inputSchema: { summary: z.string().describe("Markdown: what was built, per repo, and anything left out") },
  },
  async ({ summary }) => result(await wf.codeReady(summary)),
);

mcp.registerTool(
  "workflow_review",
  {
    description:
      "Show pre-review findings inline in the code (numbered, GitHub-style, with Fix/Dismiss/Ask) and wait. Deduplicate findings from all reviewers first. Call with an empty list to add none. Returns when the user acts; when no finding is open, propose the commit history.",
    inputSchema: { findings: z.array(finding) },
  },
  async ({ findings }) => result(await wf.review(findings), { open: wf.store?.state.findings.filter((f) => f.status === "open").map((f) => f.id) }),
);

mcp.registerTool(
  "workflow_fix_ready",
  {
    description: "A fix for a finding is in the working tree. Shows the diff under the finding and waits for approval.",
    inputSchema: { id: z.number().int() },
  },
  async ({ id }) => result(await wf.fixReady(id), { open: wf.store?.state.findings.filter((f) => f.status === "open").map((f) => f.id) }),
);

mcp.registerTool(
  "workflow_propose_history",
  {
    description: "Propose PRs and commits per repo (PR ideally <=1000 lines, commits <=300). Waits for the user to request changes or publish.",
    inputSchema: {
      prs: z.array(pr).min(1),
      assignee: z.string().optional().describe("GitHub login of the user (gh api user)"),
      reviewers: z.array(z.string()).optional(),
    },
  },
  async (history) => result(await wf.proposeHistory(history)),
);

mcp.registerTool(
  "workflow_published",
  {
    description: "Everything is pushed. Show the final screen with PR links.",
    inputSchema: { links: z.array(z.object({ repo: z.string(), title: z.string(), url: z.string() })) },
  },
  async ({ links }) => {
    wf.published(links);
    return ok("Done screen shown.");
  },
);

mcp.registerTool(
  "workflow_reply",
  {
    description: "Post a message in the cockpit chat (it is also spoken aloud). Keep it short. Optionally fill validation answers from what the user said. Returns pending events without waiting.",
    inputSchema: {
      text: z.string(),
      about: z.string().optional().describe("e.g. 'finding:3', 'slide:s2', 'file:src/a.ts', 'question:q1'"),
      setAnswers: z.record(z.string(), z.object({ optionId: z.string().optional(), text: z.string().optional() })).optional(),
    },
  },
  async ({ text, about, setAnswers }) => result(wf.reply(text, about, setAnswers)),
);

mcp.registerTool(
  "workflow_wait",
  { description: "Wait for the user's next action in the cockpit." },
  async () => result(await wf.wait()),
);

await mcp.connect(new StdioServerTransport());
console.error("[workflow] MCP server ready");
