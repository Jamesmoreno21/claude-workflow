import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Question } from "../../../shared/protocol";
import { makeState, renderScreen } from "../test/render";
import { ValidationScreen } from "./ValidationScreen";

const q = (id: string, stage: Question["stage"] = "product"): Question => ({
  id,
  stage,
  title: `Question ${id}?`,
  context: `Context for ${id}`,
  example: `Example for ${id}`,
  options: [
    { id: "a", label: `${id} option A` },
    { id: "b", label: `${id} option B` },
  ],
});

const key = (k: string) => act(() => void fireEvent.keyDown(window, { key: k }));

describe("Validation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("answers with number keys, advances, and submits with Enter", () => {
    const { send } = renderScreen(<ValidationScreen />, makeState({ questions: [q("q1"), q("q2")] }));
    expect(screen.getByText("Question q1?")).toBeTruthy();

    key("2");
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText("Question q2?")).toBeTruthy();

    key("1");
    key("Enter");
    expect(send).toHaveBeenCalledWith(
      { type: "answers", answers: { q1: { optionId: "b" }, q2: { optionId: "a" } } },
      { handoff: expect.stringMatching(/technical questions/) },
    );
  });

  it("does not submit until every question is answered", () => {
    const { send } = renderScreen(<ValidationScreen />, makeState({ questions: [q("q1"), q("q2")] }));
    key("Enter");
    expect(send).not.toHaveBeenCalled();
  });

  it("toggles the example with E", () => {
    renderScreen(<ValidationScreen />, makeState({ questions: [q("q1")] }));
    expect(screen.queryByText("Example for q1")).toBeNull();
    key("e");
    expect(screen.getByText("Example for q1")).toBeTruthy();
  });

  it("moves to technical questions once product ones are answered", () => {
    renderScreen(<ValidationScreen />, makeState({ questions: [q("p1"), q("t1", "technical")], answers: { p1: { optionId: "a" } } }));
    expect(screen.getByText("Question t1?")).toBeTruthy();
  });
});

describe("Validation after sending", () => {
  it("keeps sent answers read only", () => {
    const { send } = renderScreen(
      <ValidationScreen />,
      makeState({ questions: [q("q1")], answers: { q1: { optionId: "a" } }, submitted: ["q1"] }),
    );
    fireEvent.click(screen.getByText("q1 option B"));
    act(() => void fireEvent.keyDown(window, { key: "2" }));
    act(() => void fireEvent.keyDown(window, { key: "Enter" }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText("q1 option A").closest("button")!.className).toContain("picked");
    expect(screen.getByText("✓ Answers sent")).toBeTruthy();
  });
});
