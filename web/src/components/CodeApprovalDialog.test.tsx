import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPreference, setPreference } from "../config/settings";
import { makeState, renderScreen } from "../test/render";
import { CodeApprovalDialog } from "./CodeApprovalDialog";
import { Header } from "./Header";

describe("CodeApprovalDialog", () => {
  beforeEach(() => {
    setPreference("codeApproval", "every");
    setPreference("askCodeApproval", true);
  });

  it("starts with the saved default and picks another with number keys", () => {
    const onStart = vi.fn();
    renderScreen(<CodeApprovalDialog onStart={onStart} onClose={() => {}} />, makeState());
    expect(screen.getByRole("radio", { name: /Every file/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(window, { key: "2" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onStart).toHaveBeenCalledWith("key");
    expect(getPreference("askCodeApproval")).toBe(true); // not remembered unless asked
  });

  it("can remember the choice and stop asking", () => {
    const onStart = vi.fn();
    renderScreen(<CodeApprovalDialog onStart={onStart} onClose={() => {}} />, makeState());
    fireEvent.click(screen.getByRole("radio", { name: /Auto-approve/ }));
    fireEvent.click(screen.getByLabelText(/don't ask/));
    fireEvent.click(screen.getByText(/Start coding/));
    expect(onStart).toHaveBeenCalledWith("auto");
    expect(getPreference("codeApproval")).toBe("auto");
    expect(getPreference("askCodeApproval")).toBe(false);
  });
});

describe("Pause", () => {
  it("pauses and resumes Claude from the header", () => {
    const props = { onOpenContext: () => {}, onOpenPast: () => {}, connected: true };
    const { send, unmount } = renderScreen(<Header {...props} />, makeState({ phase: "coding" }));
    fireEvent.click(screen.getByText(/Pause Claude/));
    expect(send).toHaveBeenCalledWith({ type: "pause" });
    unmount();

    const paused = renderScreen(<Header {...props} />, makeState({ phase: "coding", paused: true }));
    expect(screen.getByText("Paused")).toBeTruthy();
    fireEvent.click(screen.getByText(/Resume Claude/));
    expect(paused.send).toHaveBeenCalledWith({ type: "resume" });
  });
});
