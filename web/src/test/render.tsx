import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import type { WorkflowState } from "../../../shared/protocol";
import { AppContext } from "../app/AppContext";

export function makeState(patch: Partial<WorkflowState> = {}): WorkflowState {
  return {
    id: "t",
    phase: "validation",
    context: { title: "Task", task: "Do the thing", repos: [{ path: "/r", name: "api", role: "change" }] },
    status: { message: "", log: [] },
    questions: [],
    answers: {},
    plan: null,
    files: [],
    summary: null,
    findings: [],
    history: null,
    outcome: null,
    chat: [],
    claudeWaiting: true,
    memory: { reviewers: [] },
    ...patch,
  };
}

/** Renders a screen with a fake connection; `send` records the events it emits. */
export function renderScreen(ui: ReactElement, state: WorkflowState) {
  const send = vi.fn();
  const setFocus = vi.fn();
  const utils = render(<AppContext.Provider value={{ state, send, focus: {}, setFocus }}>{ui}</AppContext.Provider>);
  return { ...utils, send, setFocus };
}
