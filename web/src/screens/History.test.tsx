import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProposedPR } from "../../../shared/protocol";
import { makeState, renderScreen } from "../test/render";
import { History } from "./History";

const pr: ProposedPR = {
  id: "p1",
  repo: "api",
  branch: "feat/lockout",
  base: "main",
  title: "Lock accounts",
  body: "## What\nLocks accounts.",
  commits: [
    { message: "feat: add limiter", files: ["limiter.ts"], added: 38, removed: 0 },
    { message: "feat: wire limiter", files: ["login.ts"], added: 5, removed: 1 },
  ],
};

const state = () => makeState({ phase: "history", history: { prs: [pr], reviewers: [], assignee: "me" } });

describe("History", () => {
  it("edits title, commit message and description with the pencil", () => {
    const { send } = renderScreen(<History />, state());
    fireEvent.click(screen.getByTitle(/Edit title/));

    fireEvent.change(screen.getByDisplayValue("Lock accounts"), { target: { value: "Lock accounts after failed logins" } });
    fireEvent.change(screen.getByDisplayValue("feat: wire limiter"), { target: { value: "feat(auth): enforce lockout" } });
    fireEvent.change(screen.getByDisplayValue(/Locks accounts\./), { target: { value: "Edited body" } });
    fireEvent.click(screen.getByText("Save"));

    expect(send).toHaveBeenCalledWith({
      type: "history_edited",
      prs: [
        {
          ...pr,
          title: "Lock accounts after failed logins",
          body: "Edited body",
          commits: [pr.commits[0], { ...pr.commits[1], message: "feat(auth): enforce lockout" }],
        },
      ],
    });
  });

  it("discards edits on cancel", () => {
    const { send } = renderScreen(<History />, state());
    fireEvent.click(screen.getByTitle(/Edit title/));
    fireEvent.change(screen.getByDisplayValue("Lock accounts"), { target: { value: "Nope" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText("Lock accounts")).toBeTruthy();
  });

  it("publishes with the chosen reviewers and the current PRs", () => {
    const { send } = renderScreen(<History />, state());
    const input = screen.getByPlaceholderText("add reviewer…");
    fireEvent.change(input, { target: { value: "@octocat" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByText(/Publish 1 PR/));
    expect(send).toHaveBeenLastCalledWith({ type: "publish", reviewers: ["octocat"], prs: [pr] });
  });

  it("flags PRs over the size limit", () => {
    const big = { ...pr, commits: [{ message: "huge", files: ["x"], added: 1600, removed: 0 }] };
    renderScreen(<History />, makeState({ phase: "history", history: { prs: [big], reviewers: [] } }));
    expect(screen.getByText("1600 lines").className).toContain("bad");
  });
});
