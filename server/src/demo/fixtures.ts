import type { Outcome, Plan, PublishMode, Question, Reviewer, TaskContext } from "../../../shared/protocol.js";
import type { FileStart, NewFinding, ProposedHistory } from "../core/workflow.js";

// A small, realistic task ("lock accounts after failed logins") used by the
// demo and the e2e test.

export const REPO = "api";

export const INITIAL_FILES: Record<string, string> = {
  "README.md": "# demo api\n",
  "src/auth/login.ts": `import { Router } from "express";
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
};

export const context = (repoPath: string): TaskContext => ({
  title: "Rate-limit failed logins",
  task: "Lock an account for a while after repeated failed login attempts, to stop credential stuffing.",
  taskUrl: "https://app.clickup.com/t/86demo",
  repos: [{ path: repoPath, name: REPO, role: "change" }],
  styleGuide: "Repo conventions (CLAUDE.md)",
});

export const RESEARCH_STEPS = [
  "Reading the task from ClickUp…",
  "Scanning src/auth…",
  "Checking how sessions are stored…",
  "Looking for an existing cache…",
];

export const PRODUCT_QUESTIONS: Question[] = [
  {
    id: "q1",
    stage: "product",
    title: "After how many failed attempts should the account lock?",
    context:
      'The task says *"lock an account for a while after repeated failed attempts"* but doesn\'t say how many. Too low locks out real users who mistype; too high lets attackers try more passwords.',
    example:
      "Ana mistypes her password **3 times** on her phone. With a limit of 3 she is locked out; with 5 she can still try twice more.",
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
    context:
      "Nothing in the task says when the user gets back in. A fixed window is predictable; exponential backoff punishes repeat attackers more.",
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
];

export const TECHNICAL_QUESTIONS: Question[] = [
  {
    id: "t1",
    stage: "technical",
    title: "Where should failed-attempt counters live?",
    context:
      "The API runs on **3 instances** behind a load balancer, so an in-memory counter would let an attacker get 3× the attempts. The repo already has Redis for sessions.",
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
];

export const PLAN: Plan = {
  slides: [
    {
      id: "s1",
      kind: "overview",
      title: "Lock accounts after repeated failed logins",
      narration:
        "Here's the plan. We'll count failed logins per email and per IP in Redis, and once either hits five we lock with exponential backoff. The user sees the same generic error, and the account owner gets an email.",
      body: "- **5 attempts** → lock\n- **Backoff** 1 → 5 → 15 → 60 min\n- **Generic error** + unlock email to the owner\n- Counters in **Redis**, keyed by **email and IP**",
    },
    {
      id: "s2",
      kind: "edge_cases",
      title: "Edge cases",
      narration:
        "A few edge cases. A successful login resets the email counter. Emails are normalized so capital letters don't bypass the limit. And if Redis is down, we fail open and log it, so login keeps working.",
      body: "- Successful login **resets** the email counter\n- Emails normalized (`trim`, lowercase)\n- Redis down → **fail open** + error log\n- Unknown emails still count (no user enumeration)",
    },
    {
      id: "s3",
      kind: "implementation",
      title: "New limiter module + login wiring",
      narration:
        "In code, a new limiter module wraps the Redis calls, and the login route checks it before verifying the password and records failures after.",
      body: "1. `src/auth/limiter.ts`: `check`, `fail`, `reset`\n2. `login.ts`: check before verify, record after\n3. `mailer`: unlock email on first lock",
      diagram:
        "sequenceDiagram\n  participant C as Client\n  participant L as /login\n  participant R as Redis\n  C->>L: email + password\n  L->>R: check(email, ip)\n  alt locked\n    L-->>C: 401 Invalid credentials\n  else ok\n    L->>L: verifyPassword\n    L->>R: fail() or reset()\n    L-->>C: 401 / 200\n  end",
      files: [
        { repo: REPO, path: "src/auth/limiter.ts", note: "new" },
        { repo: REPO, path: "src/auth/login.ts", note: "wire limiter" },
      ],
    },
    {
      id: "s4",
      kind: "tests",
      title: "Tests",
      narration: "We'll cover the limiter with unit tests against a fake Redis, and add route tests for the lock and reset behaviour.",
      body: "Unit + route tests, fake Redis.",
      tests: [
        "locks after 5 failures for one email",
        "locks after 20 failures from one IP",
        "success resets email counter",
        "fails open when Redis throws",
      ],
    },
    {
      id: "s5",
      kind: "prs",
      title: "One PR",
      narration: "This is small enough for a single pull request of around three hundred lines.",
      body: "Single PR, two commits: limiter, then wiring + tests.",
    },
  ],
  layers: ["API route", "Service", "Data (Redis)", "Tests"],
  prs: [{ repo: REPO, title: "Lock accounts after repeated failed logins", estimatedLines: 320, scope: "limiter + login wiring + tests" }],
};

const LIMITER = `import { redis } from "../redis";

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
`;

const LOGIN = `import { Router } from "express";
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
`;

export const FILES: (FileStart & { content: string })[] = [
  {
    repo: REPO,
    path: "src/auth/limiter.ts",
    planRef: "s3",
    intent: "New Redis-backed limiter with check / fail / reset",
    layer: "Service",
    content: LIMITER,
  },
  {
    repo: REPO,
    path: "src/auth/login.ts",
    planRef: "s3",
    intent: "Check the limiter before verifying, record the result after",
    layer: "API route",
    content: LOGIN,
  },
];

export const CODE_SUMMARY =
  "### api\n- New `limiter.ts` with Redis-backed counters per **email** and **IP**\n- `/login` checks the lock first, records failures, resets on success\n- Exponential backoff 1 → 5 → 15 → 60 min\n\n**Not included:** the unlock email (needs the mailer refactor, follow-up ticket).";

export const FINDINGS: NewFinding[] = [
  {
    severity: "high",
    category: "bug",
    repo: REPO,
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
    repo: REPO,
    path: "src/auth/login.ts",
    line: 10,
    title: "`req.ip` is the load balancer behind a proxy",
    body: "Without `app.set('trust proxy', …)`, every request shares the LB's IP, so the IP limit locks **everyone** after 20 failures.",
    source: "security",
  },
  {
    severity: "low",
    category: "style",
    repo: REPO,
    path: "src/auth/limiter.ts",
    line: 3,
    title: "Magic numbers belong in config",
    body: "The repo keeps tunables in `src/config.ts` (see CLAUDE.md).",
    source: "style",
  },
];

/** How Claude "fixes" each finding: an edit applied to the file as it is now, so fixes stack. */
export const FIXES: Record<number, { path: string; apply(content: string): string }> = {
  1: {
    path: "src/auth/limiter.ts",
    apply: (content) =>
      content.replace(
        "export async function recordFailure(email: string, ip: string) {\n",
        "export async function recordFailure(email: string, ip: string) {\n  await redis.expire(`fail:e:${norm(email)}`, 15 * 60);\n",
      ),
  },
  2: { path: "src/auth/login.ts", apply: (content) => content.replaceAll("req.ip)", 'req.ip ?? "unknown")') },
  3: {
    path: "src/auth/limiter.ts",
    apply: (content) => content.replace("const MAX_PER_EMAIL = 5;", "const MAX_PER_EMAIL = config.maxPerEmail;"),
  },
};

/** The pre-review agents and how many findings each raises. */
export const REVIEWERS: Reviewer[] = [
  {
    id: "correctness",
    name: "Correctness",
    focus: "Logic bugs, missing edge cases, error handling",
    scope: "api: src/auth/*",
    status: "running",
    findings: 1,
  },
  {
    id: "security",
    name: "Security",
    focus: "Injection, auth gaps, secrets, unsafe input",
    scope: "api: src/auth/*",
    status: "running",
    findings: 1,
  },
  {
    id: "tests",
    name: "Constraints & tests",
    focus: "Agreed decisions met, tests missing or weak",
    scope: "api: src/auth/*, tests",
    status: "running",
    findings: 0,
  },
  {
    id: "style",
    name: "Style",
    focus: "Style guide and repo conventions (CLAUDE.md)",
    scope: "api: src/auth/*",
    status: "running",
    findings: 1,
  },
];

export const CHECK_STEPS = ["Running the unit tests…", "Type-checking…", "Linting…"];

export const HISTORY: ProposedHistory = {
  assignee: "Jamesmoreno21",
  prs: [
    {
      id: "p1",
      repo: REPO,
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
};

export const PUBLISH_STEPS = ["Creating branch feat/login-lockout…", "Committing 2 commits…", "Opening PR and requesting reviewers…"];

/** What a real run reports after publishing, for each finish mode. */
export const outcomeFor = (mode: PublishMode): Outcome => ({
  mode,
  branches: [{ repo: REPO, branch: "feat/login-lockout", commits: 2 }],
  links:
    mode === "pr"
      ? [{ repo: REPO, title: "Lock accounts after repeated failed logins", url: "https://github.com/Jamesmoreno21/claude-workflow" }]
      : [],
});
