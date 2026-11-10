import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { COMMIT_LINES_TARGET, PR_LINES_MAX, PR_LINES_TARGET } from "../../../shared/constants.js";
import type { Workflow } from "../core/workflow.js";
import { loadMemory } from "../services/memory.js";
import { eventsResult, text } from "./results.js";
import { answer, finding, outcome, plannedPr, pr, question, repo, reviewer, slide } from "./schemas.js";

/** Registers every workflow_* tool. Descriptions are written for Claude. */
export function registerTools(mcp: McpServer, workflow: Workflow) {
  const withUnresolved = () => ({ unresolved: workflow.unresolvedFindingIds() });

  mcp.registerTool(
    "workflow_memory",
    { description: "Saved repos, style guides and reviewers from previous /workflow runs. Use in step 1 to offer quick picks." },
    async () => text(JSON.stringify(loadMemory(), null, 2)),
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
    async (context) =>
      text(`Cockpit open at ${await workflow.start(context)}. Research the task now, reporting progress with workflow_status.`),
  );

  mcp.registerTool(
    "workflow_context",
    { description: "Current task context (the user can edit it from the gear icon at any time) plus any pending user events." },
    async () => text(JSON.stringify(workflow.context(), null, 2)),
  );

  mcp.registerTool(
    "workflow_status",
    {
      description:
        "Update the loading screen while you research, plan or publish. Short, present tense: 'Reading the billing module…'. Returns pending user events without waiting.",
      inputSchema: { message: z.string(), phase: z.enum(["research", "planning", "checking", "publishing"]).optional() },
    },
    async ({ message, phase }) => eventsResult(workflow.status(message, phase)),
  );

  mcp.registerTool(
    "workflow_ask",
    {
      description:
        "Show validation questions and wait for answers. Send all PRODUCT questions first; once answered, send the TECHNICAL ones. Questions with an existing id are replaced. Voice answers arrive as chat events: map them with workflow_reply(setAnswers).",
      inputSchema: { questions: z.array(question).min(1) },
    },
    async ({ questions }) => eventsResult(await workflow.ask(questions)),
  );

  mcp.registerTool(
    "workflow_present_plan",
    {
      description: `Show the plan as narrated slides and wait. Order: overview, feature behaviour, edge cases, implementation (one slide per area, with files and a diagram), tests, PR split (aim <=${PR_LINES_TARGET} lines per PR, never >${PR_LINES_MAX}). Returns on approval or when the user interrupts with a question; if the answer changes the plan, call this again with updated slides.`,
      inputSchema: {
        slides: z.array(slide).min(1),
        prs: z.array(plannedPr),
        layers: z
          .array(z.string())
          .optional()
          .describe("Architecture layers this task touches, outermost first, e.g. ['UI', 'API route', 'Service', 'Data', 'Tests']"),
      },
    },
    async (plan) => eventsResult(await workflow.presentPlan(plan)),
  );

  mcp.registerTool(
    "workflow_begin_file",
    {
      description:
        "Announce the file you are about to write, and which plan slide it implements. Then edit it with your normal tools, then call workflow_file_ready.",
      inputSchema: {
        repo: z.string(),
        path: z.string().describe("Path relative to the repo root"),
        planRef: z.string().optional().describe("Slide id"),
        intent: z.string().optional().describe("One line: what changes in this file"),
        layer: z.string().optional().describe("Which of the plan's layers this file belongs to"),
      },
    },
    async (file) => eventsResult(workflow.beginFile(file)),
  );

  mcp.registerTool(
    "workflow_file_ready",
    {
      description:
        "The file is written. The UI replays the diff line by line and waits for the user to approve it or give feedback. Do not start the next file before approval.",
      inputSchema: { repo: z.string(), path: z.string() },
    },
    async ({ repo, path }) => eventsResult(await workflow.fileReady(repo, path)),
  );

  mcp.registerTool(
    "workflow_code_ready",
    {
      description: "All files approved. Show the summary screen and wait for the user to start the pre-review.",
      inputSchema: { summary: z.string().describe("Markdown: what was built, per repo, and anything left out") },
    },
    async ({ summary }) => eventsResult(await workflow.codeReady(summary)),
  );

  mcp.registerTool(
    "workflow_review",
    {
      description:
        "Show pre-review findings inline in the code (numbered, GitHub-style, with Fix/Dismiss/Ask) and wait. Deduplicate findings from all reviewers first. Call with an empty list to add none. Returns when the user acts; when no finding is unresolved, propose the commit history.",
      inputSchema: { findings: z.array(finding) },
    },
    async ({ findings }) => eventsResult(await workflow.review(findings), withUnresolved()),
  );

  mcp.registerTool(
    "workflow_reviewers",
    {
      description:
        "Show the pre-review agents on the reviewing screen: one entry per reviewer with what it checks, what it reads, its status and (when done) its finding count. Call it when you launch them and again as each one finishes. Returns pending events without waiting.",
      inputSchema: { reviewers: z.array(reviewer).min(1) },
    },
    async ({ reviewers }) => eventsResult(workflow.reviewers(reviewers)),
  );

  mcp.registerTool(
    "workflow_fix_ready",
    {
      description:
        "A fix for a finding is in the working tree; the user sees it as a diff to approve. Returns at once with any pending events (e.g. more fixes the user queued), so keep fixing; call workflow_wait when nothing is left.",
      inputSchema: { id: z.number().int() },
    },
    async ({ id }) => eventsResult(workflow.fixReady(id), withUnresolved()),
  );

  mcp.registerTool(
    "workflow_propose_history",
    {
      description: `Propose PRs and commits per repo (PR ideally <=${PR_LINES_TARGET} lines, commits <=${COMMIT_LINES_TARGET}). Waits for the user to request changes or publish.`,
      inputSchema: {
        prs: z.array(pr).min(1),
        assignee: z.string().optional().describe("GitHub login of the user (gh api user)"),
        reviewers: z.array(z.string()).optional(),
      },
    },
    async (history) => eventsResult(await workflow.proposeHistory(history)),
  );

  mcp.registerTool(
    "workflow_published",
    {
      description:
        "The commit step is done (local commits, pushed branches, or PRs, per the publish event's mode). Shows the final screen.",
      inputSchema: outcome,
    },
    async (result) => {
      workflow.published(result);
      return text("Done screen shown. The workflow is finished; you may end your turn.");
    },
  );

  mcp.registerTool(
    "workflow_end",
    {
      description:
        "End the workflow early when the user asks for it in the terminal. The cockpit shows it ended and you may end your turn. Not needed after workflow_published.",
    },
    async () => {
      workflow.end();
      return text("Workflow ended.");
    },
  );

  mcp.registerTool(
    "workflow_reply",
    {
      description:
        "Post a message in the cockpit chat (it is also spoken aloud). Keep it short. Optionally fill validation answers from what the user said. Returns pending events without waiting.",
      inputSchema: {
        text: z.string(),
        about: z.string().optional().describe("e.g. 'finding:3', 'slide:s2', 'file:src/a.ts', 'question:q1'"),
        setAnswers: z.record(z.string(), answer).optional(),
      },
    },
    async ({ text: message, about, setAnswers }) => eventsResult(workflow.reply(message, about, setAnswers)),
  );

  mcp.registerTool("workflow_wait", { description: "Wait for the user's next action in the cockpit." }, async () =>
    eventsResult(await workflow.wait()),
  );
}
