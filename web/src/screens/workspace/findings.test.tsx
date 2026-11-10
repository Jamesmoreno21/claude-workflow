import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Finding } from "../../../../shared/protocol";
import { makeState, renderScreen } from "../../test/render";
import { LoadingScreen } from "../LoadingScreen";
import { ReviewingScreen } from "../ReviewingScreen";
import { FindingBox, FixBanner } from "./findings";

const finding: Finding = {
  id: 7,
  severity: "high",
  category: "bug",
  repo: "api",
  path: "src/a.ts",
  line: 3,
  title: "Counters never expire",
  body: "No TTL.",
  status: "open",
};

describe("review findings", () => {
  it("lets the user queue a fix while Claude is busy, or mark it fixed by hand", () => {
    const { send } = renderScreen(<FindingBox finding={finding} selected onSelect={() => {}} />, makeState({ claudeWaiting: false }));
    const fix = screen.getByText("Fix") as HTMLButtonElement;
    expect(fix.disabled).toBe(false);
    fireEvent.click(fix);
    fireEvent.click(screen.getByText("Fixed manually"));
    expect(send.mock.calls.map(([event]) => event)).toEqual([
      { type: "finding_fix", id: 7 },
      { type: "finding_fixed_manually", id: 7 },
    ]);
  });

  it("sends an adjustment to a proposed fix with Enter", () => {
    const { send } = renderScreen(<FixBanner finding={{ ...finding, status: "fixing" }} />, makeState());
    const input = screen.getByPlaceholderText(/Say what to change/);
    fireEvent.change(input, { target: { value: "use a constant" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(send).toHaveBeenCalledWith({ type: "fix_rejected", id: 7, text: "use a constant" });
    expect((input as HTMLInputElement).value).toBe("");
  });
});

describe("ReviewingScreen", () => {
  it("shows each reviewer agent with what it checks and its progress", () => {
    renderScreen(
      <ReviewingScreen />,
      makeState({
        phase: "reviewing",
        reviewers: [
          { id: "sec", name: "Security", focus: "Injection and auth", scope: "api: src/auth/*", status: "done", findings: 2 },
          { id: "style", name: "Style", focus: "Conventions", status: "running" },
        ],
      }),
    );
    expect(screen.getByText("Reviewers at work: 1 of 2 done")).toBeTruthy();
    expect(screen.getByText("Injection and auth")).toBeTruthy();
    expect(screen.getByText("api: src/auth/*")).toBeTruthy();
    expect(screen.getByText("2 findings")).toBeTruthy();
    expect(screen.getByText("Reviewing…")).toBeTruthy();
  });
});

describe("publishing title", () => {
  it("never mentions GitHub when only committing locally", () => {
    renderScreen(<LoadingScreen />, makeState({ phase: "publishing", publishMode: "local" }));
    expect(screen.getByRole("heading").textContent).toBe("Creating the commits");
  });
});
