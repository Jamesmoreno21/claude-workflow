// Scripted stand-in for Claude so the cockpit can be designed and tested
// without a real session: `npm run demo`, then open the printed URL.
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { UserEvent } from "../../shared/protocol.js";
import { Workflow } from "./workflow.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const repoPath = mkdtempSync(join(tmpdir(), "wf-demo-"));
process.env.WORKFLOW_HOME = mkdtempSync(join(tmpdir(), "wf-demo-home-"));
const write = (path: string, content: string) => {
  mkdirSync(dirname(join(repoPath, path)), { recursive: true });
  writeFileSync(join(repoPath, path), content);
};

write(
  "src/auth/login.ts",
  `import { Router } from "express";
import { verifyPassword } from "./password";
import { users } from "../db";

export const login = Router();

login.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await users.findByEmail(email);
  if (!user || !(await verifyPassword(user, password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  req.session.userId = user.id;
  res.json({ ok: true });
});
`,
);
write("README.md", "# demo api\n");
execSync(`git init -q && git add . && git -c user.email=demo@x -c user.name=demo commit -qm init`, { cwd: repoPath });

const wf = new Workflow();

/** Answers chat like a (very polite) Claude until `done` matches an event. */
async function until(first: Promise<UserEvent[]>, done: (e: UserEvent) => boolean, onEvent?: (e: UserEvent) => Promise<void> | void) {
  let events = await first;
  for (;;) {
    for (const e of events) {
      if (e.type === "chat") wf.reply(`(demo) Good question about "${e.text.slice(0, 60)}". In a real run I'd answer here.`, e.about);
      await onEvent?.(e);
      if (done(e)) return e;
    }
    events = await wf.wait();
  }
}

const url = await wf.start(
  {
    title: "Rate-limit failed logins",
    task: "Lock an account for a while after repeated failed login attempts, to stop credential stuffing.",
    taskUrl: "https://app.clickup.com/t/86demo",
    repos: [{ path: repoPath, name: "api", role: "change" }],
    styleGuide: "Repo conventions (CLAUDE.md)",
  },
  { openBrowser: !process.argv.includes("--no-open") },
);
console.log(`\n  Workflow demo running at ${url}\n  Demo repo: ${repoPath}\n`);

for (const m of ["Reading the task from ClickUp…", "Scanning src/auth…", "Checking how sessions are stored…", "Looking for an existing cache…"]) {
  wf.status(m, "research");
  await sleep(1200);
}

await until(
  wf.ask([
    {
      id: "q1",
      stage: "product",
      title: "After how many failed attempts should the account lock?",
      context: "The task says *\"lock an account for a while after repeated failed attempts\"* but doesn't say how many. Too low locks out real users who mistype; too high lets attackers try more passwords.",
      example: "Ana mistypes her password **3 times** on her phone. With a limit of 3 she is locked out; with 5 she can still try twice more.",
      options: [
        { id: "a", label: "3 attempts", description: "Strictest. More support tickets.", example: "3rd wrong password → locked" },
        { id: "b", label: "5 attempts", description: "Common default (OWASP guidance).", example: "5th wrong password → locked" },
        { id: "c", label: "10 attempts", description: "Friendliest; weaker against stuffing." },
      ],
      recommended: "b",
    },
    {
      id: "q2",
      stage: "product",
      title: "How long should the lock last?",
      context: "Nothing in the task says when the user gets back in. A fixed window is predictable; exponential backoff punishes repeat attackers more.",
      example: "Locked at 10:00. **Fixed 15 min** → can retry at 10:15. **Backoff** → 1 min, then 5, then 15, then 60.",
      options: [
        { id: "a", label: "Fixed 15 minutes", description: "Simple to explain to users." },
        { id: "b", label: "Exponential backoff", description: "1 → 5 → 15 → 60 minutes." },
        { id: "c", label: "Until password reset", description: "Safest, but forces support or email flow." },
      ],
      recommended: "b",
    },
    {
      id: "q3",
      stage: "product",
      title: "What should a locked user see?",
      context: "Telling the user the account is locked helps real users, but confirms to an attacker that the email exists.",
      options: [
        { id: "a", label: "Generic error", description: "Same 'Invalid credentials' message. No info leak." },
        { id: "b", label: "Locked + time left", description: "'Try again in 12 minutes'. Clearer, leaks existence." },
        { id: "c", label: "Generic + email", description: "Generic error, and the owner gets an email with an unlock link." },
      ],
      recommended: "c",
    },
  ]),
  (e) => e.type === "answers",
);

await until(
  wf.ask([
    {
      id: "t1",
      stage: "technical",
      title: "Where should failed-attempt counters live?",
      context: "The API runs on **3 instances** behind a load balancer, so an in-memory counter would let an attacker get 3× the attempts. The repo already has Redis for sessions.",
      options: [
        { id: "a", label: "Redis (existing)", description: "Shared, TTL built in. Already a dependency." },
        { id: "b", label: "Postgres column", description: "Durable, but a write on every failed login." },
        { id: "c", label: "In memory", description: "Simplest; wrong with multiple instances." },
      ],
      recommended: "a",
    },
    {
      id: "t2",
      stage: "technical",
      title: "Key the counter by email, IP, or both?",
      context: "By email stops guessing one account; by IP stops one machine spraying many accounts.",
      example: "Attacker tries `password123` against **1,000 different emails** from one IP: an email-only key never trips.",
      options: [
        { id: "a", label: "Email only" },
        { id: "b", label: "Email + IP (two limits)", description: "Both counters; either one locks." },
        { id: "c", label: "IP only" },
      ],
      recommended: "b",
    },
  ]),
  (e) => e.type === "answers",
);

wf.status("Drafting the implementation plan…", "planning");
await sleep(1500);

const plan = {
  slides: [
    {
      id: "s1",
      kind: "overview" as const,
      title: "Lock accounts after repeated failed logins",
      narration: "Here's the plan. We'll count failed logins per email and per IP in Redis, and once either hits five we lock with exponential backoff. The user sees the same generic error, and the account owner gets an email.",
      body: "- **5 attempts** → lock\n- **Backoff** 1 → 5 → 15 → 60 min\n- **Generic error** + unlock email to the owner\n- Counters in **Redis**, keyed by **email and IP**",
    },
    {
      id: "s2",
      kind: "edge_cases" as const,
      title: "Edge cases",
      narration: "A few edge cases. A successful login resets the email counter. Emails are normalized so capital letters don't bypass the limit. And if Redis is down, we fail open and log it, so login keeps working.",
      body: "- Successful login **resets** the email counter\n- Emails normalized (`trim`, lowercase)\n- Redis down → **fail open** + error log\n- Unknown emails still count (no user enumeration)",
    },
    {
      id: "s3",
      kind: "implementation" as const,
      title: "New limiter module + login wiring",
      narration: "In code, a new limiter module wraps the Redis calls, and the login route checks it before verifying the password and records failures after.",
      body: "1. `src/auth/limiter.ts`: `check`, `fail`, `reset`\n2. `login.ts`: check before verify, record after\n3. `mailer`: unlock email on first lock",
      diagram: "sequenceDiagram\n  participant C as Client\n  participant L as /login\n  participant R as Redis\n  C->>L: email + password\n  L->>R: check(email, ip)\n  alt locked\n    L-->>C: 401 Invalid credentials\n  else ok\n    L->>L: verifyPassword\n    L->>R: fail() or reset()\n    L-->>C: 401 / 200\n  end",
      files: [
        { repo: "api", path: "src/auth/limiter.ts", note: "new" },
        { repo: "api", path: "src/auth/login.ts", note: "wire limiter" },
      ],
    },
    {
      id: "s4",
      kind: "tests" as const,
      title: "Tests",
      narration: "We'll cover the limiter with unit tests against a fake Redis, and add route tests for the lock and reset behaviour.",
      body: "Unit + route tests, fake Redis.",
      tests: ["locks after 5 failures for one email", "locks after 20 failures from one IP", "success resets email counter", "fails open when Redis throws"],
    },
    {
      id: "s5",
      kind: "prs" as const,
      title: "One PR",
      narration: "This is small enough for a single pull request of around three hundred lines.",
      body: "Single PR, two commits: limiter, then wiring + tests.",
    },
  ],
  prs: [{ repo: "api", title: "Lock accounts after repeated failed logins", estimatedLines: 320, scope: "limiter + login wiring + tests" }],
};
await until(wf.presentPlan(plan), (e) => e.type === "plan_approved");

const files: [string, string, string, string][] = [
  [
    "src/auth/limiter.ts",
    "s3",
    "New Redis-backed limiter with check / fail / reset",
    `import { redis } from "../redis";

const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;
const BACKOFF_MIN = [1, 5, 15, 60];

const norm = (email: string) => email.trim().toLowerCase();

export async function isLocked(email: string, ip: string): Promise<boolean> {
  try {
    const [byEmail, byIp] = await redis.mget(\`lock:e:\${norm(email)}\`, \`lock:ip:\${ip}\`);
    return Boolean(byEmail || byIp);
  } catch (err) {
    console.error("limiter unavailable, failing open", err);
    return false;
  }
}

export async function recordFailure(email: string, ip: string) {
  const e = await redis.incr(\`fail:e:\${norm(email)}\`);
  const i = await redis.incr(\`fail:ip:\${ip}\`);
  if (e >= MAX_PER_EMAIL) {
    const level = Number(await redis.incr(\`level:\${norm(email)}\`)) - 1;
    const minutes = BACKOFF_MIN[Math.min(level, BACKOFF_MIN.length - 1)];
    await redis.set(\`lock:e:\${norm(email)}\`, "1", "EX", minutes * 60);
    await redis.del(\`fail:e:\${norm(email)}\`);
  }
  if (i >= MAX_PER_IP) await redis.set(\`lock:ip:\${ip}\`, "1", "EX", 15 * 60);
}

export async function reset(email: string) {
  await redis.del(\`fail:e:\${norm(email)}\`, \`level:\${norm(email)}\`);
}
`,
  ],
  [
    "src/auth/login.ts",
    "s3",
    "Check the limiter before verifying, record the result after",
    `import { Router } from "express";
import { verifyPassword } from "./password";
import { isLocked, recordFailure, reset } from "./limiter";
import { users } from "../db";

export const login = Router();

login.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (await isLocked(email, req.ip)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const user = await users.findByEmail(email);
  if (!user || !(await verifyPassword(user, password))) {
    await recordFailure(email, req.ip);
    return res.status(401).json({ error: "Invalid credentials" });
  }
  await reset(email);
  req.session.userId = user.id;
  res.json({ ok: true });
});
`,
  ],
];

for (const [path, planRef, intent, content] of files) {
  wf.beginFile("api", path, planRef, intent);
  await sleep(1500);
  write(path, content);
  await until(wf.fileReady("api", path), (e) => (e.type === "file_approved" && e.path === path) || e.type === "file_feedback", async (e) => {
    if (e.type === "file_feedback") wf.reply("(demo) Noted, a real run would rework the file now.", `file:${e.path}`);
  });
}

await until(
  wf.codeReady(
    "### api\n- New `limiter.ts` with Redis-backed counters per **email** and **IP**\n- `/login` checks the lock first, records failures, resets on success\n- Exponential backoff 1 → 5 → 15 → 60 min\n\n**Not included:** the unlock email (needs the mailer refactor, follow-up ticket).",
  ),
  (e) => e.type === "start_review",
);

wf.status("Reviewers are reading the changes…");
await sleep(1500);

const fixes: Record<number, () => void> = {
  1: () =>
    write(
      "src/auth/limiter.ts",
      files[0][3].replace(
        "export async function recordFailure(email: string, ip: string) {\n  const e",
        "export async function recordFailure(email: string, ip: string) {\n  await redis.expire(`fail:e:${norm(email)}`, 15 * 60);\n  const e",
      ),
    ),
};

const open = () => wf.store!.state.findings.filter((f) => f.status === "open" || f.status === "fixing").length;
let next = wf.review([
  {
    severity: "high",
    category: "bug",
    repo: "api",
    path: "src/auth/limiter.ts",
    line: 20,
    title: "Failure counters never expire",
    body: "`fail:e:*` and `fail:ip:*` are created with `INCR` and no TTL. One typo a month eventually adds up to a lock, months later.",
    suggestion: "Set a 15-minute TTL on first increment.",
    source: "correctness",
  },
  {
    severity: "medium",
    category: "security",
    repo: "api",
    path: "src/auth/login.ts",
    line: 10,
    title: "`req.ip` is the load balancer behind a proxy",
    body: "Without `app.set('trust proxy', …)`, every request shares the LB's IP, so the IP limit locks **everyone** after 20 failures.",
    source: "security",
  },
  {
    severity: "low",
    category: "style",
    repo: "api",
    path: "src/auth/limiter.ts",
    line: 3,
    title: "Magic numbers belong in config",
    body: "The repo keeps tunables in `src/config.ts` (see CLAUDE.md).",
    source: "style",
  },
]);
while (open() > 0) {
  let fixing: Promise<UserEvent[]> | null = null;
  for (const e of await next) {
    if (e.type === "chat") wf.reply("(demo) In a real run I'd explain the finding here.", e.about);
    if (e.type === "finding_fix" || e.type === "fix_rejected") {
      await sleep(1200);
      (fixes[e.id] ?? (() => write("src/auth/login.ts", files[1][3].replace("req.ip", "req.ip ?? \"unknown\""))))();
      fixing = wf.fixReady(e.id);
    }
  }
  next = fixing ?? wf.wait();
}

await until(
  wf.proposeHistory({
    assignee: "Jamesmoreno21",
    prs: [
      {
        id: "p1",
        repo: "api",
        branch: "feat/login-lockout",
        base: "main",
        title: "Lock accounts after repeated failed logins",
        body: "## What\nLocks an account (per email and per IP) after repeated failed logins, with exponential backoff.\n\n## Why\nCredential stuffing. ClickUp 86demo.\n\n## Testing\n- Unit tests for limiter\n- Route tests for lock/reset",
        commits: [
          { message: "feat(auth): add redis-backed login limiter", files: ["src/auth/limiter.ts"], added: 38, removed: 0 },
          { message: "feat(auth): enforce lockout on /login", files: ["src/auth/login.ts"], added: 5, removed: 0 },
        ],
      },
    ],
  }),
  (e) => e.type === "publish",
);

for (const m of ["Creating branch feat/login-lockout…", "Committing 2 commits…", "Opening PR and requesting reviewers…"]) {
  wf.status(m, "publishing");
  await sleep(1000);
}
wf.published([{ repo: "api", title: "Lock accounts after repeated failed logins", url: "https://github.com/Jamesmoreno21/claude-workflow" }]);
console.log("  Demo finished. Ctrl+C to exit.");
