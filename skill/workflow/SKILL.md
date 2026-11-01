---
name: workflow
description: Run a coding task through the Workflow cockpit — collect context, validate product and technical decisions, present a narrated plan, code file by file with approvals, pre-review with agents, and publish PRs. Use when the user types /workflow or asks to start a task "with the workflow".
---

# /workflow

You are driving a task through a local cockpit UI (the `workflow` MCP server).
The user follows along **in the browser, not the terminal**. Keep terminal
output to one short line per step. Everything the user must read or decide
goes into the cockpit through `workflow_*` tools.

Golden rules:

- **The cockpit is the conversation.** After `workflow_start`, never ask
  questions in the terminal. Ask through `workflow_ask`, answer through
  `workflow_reply`.
- **Waiting tools return user events.** Handle every event in the result,
  following its `next` hints. When the result says the user is still working,
  call `workflow_wait`. Never end your turn while the workflow is running.
- **Chat and voice messages** arrive as `chat` events with an `about` field
  (`question:q2`, `slide:s3`, `file:repo/path`, `finding:4`, `pr:p1`). Reply
  with `workflow_reply`: short, plain sentences that sound right when spoken
  aloud. Then act on the message if it asks for a change.
- **Context can change.** A `context_changed` event means the user edited the
  task from the gear icon. Re-read it and adapt the current step.

## 1. Context (terminal, brief)

1. Say: "Hi! What's the task?" They may give a ClickUp/Linear/Jira link, a
   GitHub issue, or plain text. Fetch links with the available tools
   (`gh issue view`, MCP connectors, WebFetch). If one can't be read, ask them
   to paste the text.
2. Call `workflow_memory`. Ask which repositories to use with AskUserQuestion,
   offering recent repos as options and the current directory first. For each
   repo, ask whether it gets changes or is context only.
3. Ask for designs (Figma link, screenshots, or "none").
4. Ask for the style guide. Offer saved ones from memory as options, plus "the
   repo's own conventions" (CLAUDE.md, CONTRIBUTING, lint config) and "paste a
   new one".
5. Call `workflow_start` with a short title and the full context. Say one line:
   "Cockpit is open at <url>. I'll continue there."

## 2. Research (loading screen)

Read the task, the relevant code in every repo and the style guide. Report
progress with `workflow_status` every few steps, for example "Reading the auth
middleware…". Use Explore subagents for wide searches across repos.

## 3. Validation

Find what the task leaves undecided.

**Product questions first**: behaviour, edge cases, copy, permissions, empty
states, limits, what happens on failure. Then **technical questions**: data
model, migrations, API shape, backwards compatibility, caching, feature flags,
test strategy.

For each question:

- `context`: what the task says, what's missing, and why it matters, so the
  user can decide without reading anything else.
- `example`: a concrete scenario showing the condition, for example "User has 3
  failed logins, waits 10 minutes, tries again: …".
- 2–4 options, each with a one-line consequence and its own `example`. Set
  `recommended`.
- Only ask what really changes the outcome. Aim for 3–7 product questions and
  3–7 technical questions.

The chat sidebar is open during validation. Use it (`workflow_reply`) to
share references the user may want to check, such as links to official docs,
RFCs and existing code, as markdown links.

Send the product questions with `workflow_ask`. When the answers arrive, send
the technical ones (later answers can make some of them unnecessary). If the
user answers by voice, map the answer with
`workflow_reply(setAnswers: {...})` and confirm briefly.

## 4. Plan

Call `workflow_status(phase: "planning")` while you prepare the plan, then call
`workflow_present_plan`. Slides, in this order:

1. **overview**: the goal in one sentence and the agreed decisions.
2. **feature**: the behaviour from the user's point of view.
3. **edge_cases**: each edge case and how it's handled.
4. **implementation**: one slide per area or repo, with the files to touch
   (`files`), a mermaid `diagram` (sequence or flow), and data changes.
5. **tests**: the tests that will be written (`tests`).
6. **prs**: how the work splits into PRs. Aim for 1000 lines or fewer per PR.
   300–400 over is OK; never more than 1500. Stack PRs when needed.

Also pass `layers`: the architecture layers this task touches, outermost
first (for example `["UI", "API route", "Service", "Data access", "Tests"]`).
The coding screen uses them to show where each file sits.

`narration` is spoken aloud: 2–5 conversational sentences per slide, no
markdown, and no reading the bullets word for word. If the user interrupts
with a question, answer it with `workflow_reply` (about: the slide). If the
answer changes the plan, call `workflow_present_plan` again with the updated
slides (same ids).

## 5. Coding

For each file, in the order of the plan:

1. `workflow_begin_file(repo, path, planRef, intent, layer)`, where `layer`
   is one of the plan's `layers`
2. Write the change with your normal Edit/Write tools, following the style
   guide.
3. `workflow_file_ready(repo, path)`. The user watches the diff replay and
   approves it, or gives feedback (`file_feedback`) that you apply before
   calling `workflow_file_ready` again.

Don't start the next file until the current one is approved. A
`file_feedback` on an already approved file reopens it. Run the relevant tests
when a logical unit is complete, and mention the results in a short
`workflow_reply`.

When every file is approved, call `workflow_code_ready` with a markdown
summary.

## 6. Pre-review

On `start_review`, call `workflow_status("Reviewers are reading the changes…")`,
then launch **parallel review subagents** (Agent tool) over the full diff of
every change repo:

- **correctness**: logic bugs, edge cases from the plan that are missing,
  error handling.
- **security**: injection, authz/authn gaps, secrets, unsafe input, data
  exposure.
- **constraints and tests**: requirements from validation that aren't met, and
  missing or weak tests.
- **style**: the provided style guide and the repo's own conventions
  (CLAUDE.md, lint rules, nearby code).

Merge and deduplicate the findings, drop anything you can't back with a
concrete failure scenario, then call `workflow_review(findings)`. Then:

- `finding_fix`: fix it, then `workflow_fix_ready(id)`.
- `fix_rejected`: rework it using the note, then `workflow_fix_ready(id)`
  again.
- A `chat` event about `finding:N`: answer it. If the user tells you to fix or
  dismiss it, do that.
- When no finding is open, go to step 7.

## 7. Commit history and publish

For each change repo, read `.github/pull_request_template.md` (or similar)
and get the user's login with `gh api user -q .login`. Group the diff into
PRs (1000 lines or fewer each, stacked if dependent) and commits (300 lines or
fewer each, each one building and passing tests where possible, with
conventional messages that match the repo's history). Fill each PR body from
the template. Call `workflow_propose_history`.

Revise and call it again on any `chat` or `history_changed` event with text.
`history_edited` means the user edited titles, branches, commit messages or
descriptions with the pencil. Their version is final, so build on it and
never revert it. The `publish` event carries the final `prs`.
On `publish`, with `workflow_status(phase: "publishing")` updates:

1. Create each branch from its base (stacked PRs branch from their parent),
   stage exactly the planned files or hunks per commit, and commit.
2. Push, then
   `gh pr create --title … --body … --base … --head … --assignee @me --reviewer <reviewers>`.
3. Call `workflow_published(links)` and say one line in the terminal with the
   links.

Never force-push, and never push to the default branch.
