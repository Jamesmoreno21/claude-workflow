// Scripted stand-in for Claude, so the cockpit can be designed and tested
// without a real session: `npm run demo`, then open the printed URL.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { UserEvent } from "../../../shared/protocol.js";
import { settings } from "../config/settings.js";
import { Workflow } from "../core/workflow.js";
import * as demo from "./fixtures.js";

// Keep demo runs out of the user's real memory (~/.claude-workflow).
process.env.WORKFLOW_HOME = mkdtempSync(join(tmpdir(), "wf-demo-home-"));
const repoPath = mkdtempSync(join(tmpdir(), "wf-demo-"));

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms * settings.demoSpeed));

function writeFile(path: string, content: string) {
  mkdirSync(dirname(join(repoPath, path)), { recursive: true });
  writeFileSync(join(repoPath, path), content);
}

function createDemoRepo() {
  for (const [path, content] of Object.entries(demo.INITIAL_FILES)) writeFile(path, content);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repoPath });
  git("init", "-q");
  git("add", ".");
  git("-c", "user.email=demo@example.com", "-c", "user.name=demo", "commit", "-qm", "init");
}

const workflow = new Workflow();

/** Waits until an event matches `done`, answering chat messages along the way. */
async function until(first: Promise<UserEvent[]>, done: (event: UserEvent) => boolean) {
  let events = await first;
  for (;;) {
    for (const event of events) {
      if (event.type === "chat")
        workflow.reply(`(demo) Good question about "${event.text.slice(0, 60)}". A real run answers here.`, event.about);
      if (event.type === "file_feedback") workflow.reply("(demo) Noted; a real run would rework the file now.", `file:${event.path}`);
      if (done(event)) return event;
    }
    events = await workflow.wait();
  }
}

async function runReview() {
  let next = workflow.review(demo.FINDINGS);
  while (workflow.unresolvedFindingIds().length) {
    let fixShown: Promise<UserEvent[]> | null = null;
    for (const event of await next) {
      if (event.type === "chat") workflow.reply("(demo) A real run explains the finding here.", event.about);
      if (event.type === "finding_fix" || event.type === "fix_rejected") {
        await pause(1200);
        const fix = demo.FIXES[event.id];
        writeFile(fix.path, fix.content);
        fixShown = workflow.fixReady(event.id);
      }
    }
    next = fixShown ?? workflow.wait();
  }
}

createDemoRepo();
const url = await workflow.start(demo.context(repoPath), { openBrowser: !process.argv.includes("--no-open") });
console.log(`\n  Workflow demo running at ${url}\n  Demo repo: ${repoPath}\n`);

for (const step of demo.RESEARCH_STEPS) {
  workflow.status(step, "research");
  await pause(1200);
}

await until(workflow.ask(demo.PRODUCT_QUESTIONS), (e) => e.type === "answers");
await until(workflow.ask(demo.TECHNICAL_QUESTIONS), (e) => e.type === "answers");

workflow.status("Drafting the implementation plan…", "planning");
await pause(1500);
await until(workflow.presentPlan(demo.PLAN), (e) => e.type === "plan_approved");

for (const { content, ...file } of demo.FILES) {
  workflow.beginFile(file);
  await pause(1500);
  writeFile(file.path, content);
  await until(workflow.fileReady(file.repo, file.path), (e) => e.type === "file_approved" && e.path === file.path);
}

await until(workflow.codeReady(demo.CODE_SUMMARY), (e) => e.type === "start_review");
workflow.status("Reviewers are reading the changes…");
await pause(1500);
await runReview();

const publish = await until(workflow.proposeHistory(demo.HISTORY), (e) => e.type === "publish");
const mode = publish.type === "publish" ? publish.mode : "local";
for (const step of demo.PUBLISH_STEPS) {
  workflow.status(step, "publishing");
  await pause(1000);
}
workflow.published(demo.outcomeFor(mode));
console.log("  Demo finished. Ctrl+C to exit.");
