import { z } from "zod";
import { FINDING_CATEGORIES, QUESTION_STAGES, REPO_ROLES, SEVERITIES, SLIDE_KINDS } from "../../../shared/protocol.js";

// Tool input schemas. The descriptions are what Claude reads, so they say
// what good input looks like, not just its type.

export const repo = z.object({
  path: z.string().describe("Absolute path to the local checkout"),
  name: z.string().describe("Short name used in every other tool call"),
  role: z.enum(REPO_ROLES).describe("'context' repos are read only"),
});

const option = z.object({
  id: z.string(),
  label: z.string().describe("2-6 words"),
  description: z.string().optional().describe("One sentence on the consequence"),
  example: z.string().optional().describe("Concrete scenario showing what this option means in practice"),
});

export const question = z.object({
  id: z.string(),
  stage: z.enum(QUESTION_STAGES),
  title: z.string().describe("The question, one line"),
  context: z
    .string()
    .describe("Markdown. Everything needed to decide without reading the terminal: what the task says, what's missing, why it matters"),
  example: z.string().optional().describe("Markdown. A worked example of the condition being decided"),
  options: z.array(option).min(2).max(4),
  recommended: z.string().optional().describe("Option id you would pick"),
});

export const slide = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(SLIDE_KINDS),
  narration: z.string().describe("What you say out loud: 2-5 conversational sentences, no markdown"),
  body: z.string().describe("Markdown shown on the slide. Bullets, not paragraphs"),
  diagram: z.string().optional().describe("Mermaid source (flowchart/sequenceDiagram/erDiagram)"),
  files: z.array(z.object({ repo: z.string(), path: z.string(), note: z.string().optional() })).optional(),
  tests: z.array(z.string()).optional(),
});

export const plannedPr = z.object({ repo: z.string(), title: z.string(), estimatedLines: z.number().int(), scope: z.string() });

export const finding = z.object({
  severity: z.enum(SEVERITIES),
  category: z.enum(FINDING_CATEGORIES),
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

export const pr = z.object({
  id: z.string(),
  repo: z.string(),
  branch: z.string(),
  base: z.string(),
  title: z.string(),
  body: z.string().describe("Filled from the repo's PR template when one exists"),
  commits: z.array(commit),
  dependsOn: z.string().optional().describe("id of the PR this one stacks on"),
});

export const publishedLink = z.object({ repo: z.string(), title: z.string(), url: z.string() });

export const answer = z.object({ optionId: z.string().optional(), text: z.string().optional() });
