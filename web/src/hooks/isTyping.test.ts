import { describe, expect, it } from "vitest";
import { isTyping } from "./useHotkeys";

describe("isTyping", () => {
  it("treats form fields and the code editor as typing, so shortcuts and push-to-talk stay out of the way", () => {
    const input = document.createElement("input");
    const monaco = document.createElement("div");
    monaco.className = "monaco-editor";
    const editContextTarget = document.createElement("div");
    monaco.appendChild(editContextTarget);
    const button = document.createElement("button");

    expect(isTyping(input)).toBe(true);
    expect(isTyping(editContextTarget)).toBe(true);
    expect(isTyping(button)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
