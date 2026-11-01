import { act, fireEvent, renderHook } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

/** Stands in for the browser's SpeechRecognition: "hears" a fixed sentence. */
class FakeRecognizer {
  static last: FakeRecognizer | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror = null;
  start() {
    FakeRecognizer.last = this;
    this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "why redis" }, isFinal: true }] });
  }
  stop() {
    this.onend?.();
  }
}

let usePushToTalk: typeof import("./usePushToTalk").usePushToTalk;

beforeAll(async () => {
  vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
  // Imported after the stub: support is detected when the module loads.
  ({ usePushToTalk } = await import("./usePushToTalk"));
});

const press = (init: KeyboardEventInit) => act(() => void fireEvent.keyDown(window, init));

describe("usePushToTalk", () => {
  it("⌘P starts listening and a second ⌘P sends the transcript", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => usePushToTalk(onTranscript));

    press({ key: "p", metaKey: true });
    expect(result.current.listening).toBe(true);
    expect(result.current.mode).toBe("toggle");

    press({ key: "p", metaKey: true });
    expect(result.current.listening).toBe(false);
    expect(onTranscript).toHaveBeenCalledWith("why redis");
  });

  it("Escape cancels without sending", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => usePushToTalk(onTranscript));
    press({ key: "p", ctrlKey: true });
    press({ key: "Escape" });
    expect(result.current.listening).toBe(false);
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("swallows ⌘P so the browser doesn't open the print dialog", () => {
    renderHook(() => usePushToTalk(vi.fn()));
    const event = new KeyboardEvent("keydown", { key: "p", metaKey: true, cancelable: true });
    act(() => void window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
  });

  it("holding Space talks and releasing sends", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => usePushToTalk(onTranscript));
    press({ key: " ", code: "Space" });
    expect(result.current.mode).toBe("hold");
    act(() => void fireEvent.keyUp(window, { key: " ", code: "Space" }));
    expect(onTranscript).toHaveBeenCalledWith("why redis");
  });
});
