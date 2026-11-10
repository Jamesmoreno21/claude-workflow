import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRows } from "../lib/diff";
import { useReplay } from "./useReplay";

const lines = (n: number, prefix = "line") => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join("\n") + "\n";

describe("useReplay", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // Two hunks: "    one" + "two" near the top, "three" far below.
  const before = lines(20);
  const after = before.replace("line 2\n", "line 2\n    one\ntwo\n").replace("line 19\n", "line 19\nthree\n");
  const rows = buildRows(before, after);

  const setup = (enabled = true) => renderHook(() => useReplay(rows, "k", enabled)).result;

  // Each tick re-renders and schedules the next character, so advance like a real clock.
  const elapse = (ms: number) => {
    for (let t = 0; t < ms; t += 10) act(() => vi.advanceTimersByTime(10));
  };

  it("types at a human pace, skipping indentation and pausing between hunks", () => {
    const r = setup();
    expect(r.current.pos).toBe(0);
    act(() => vi.advanceTimersByTime(0)); // indentation appears at once
    expect(r.current.pos).toBe(4);

    elapse(100);
    expect(r.current.progress.line).toBe(0); // still typing "one"

    elapse(900);
    // Both lines of the first hunk are done; the second hunk waits for its pause.
    expect(r.current.progress.line).toBe(2);
    expect(r.current.done).toBe(false);

    elapse(2000);
    expect(r.current.done).toBe(true);
    expect(r.current.playing).toBe(false);
  });

  it("steps one line forward and back, pausing playback", () => {
    const r = setup();
    act(() => r.current.forward());
    expect(r.current.playing).toBe(false);
    expect(r.current.progress.line).toBe(1);
    act(() => r.current.forward());
    expect(r.current.progress.line).toBe(2);
    act(() => r.current.back());
    expect(r.current.progress.line).toBe(1);
    act(() => r.current.back());
    expect(r.current.pos).toBe(0);
  });

  it("jumps between hunks with shift", () => {
    const r = setup();
    act(() => r.current.forward(true));
    // At the start of the "three" hunk: both lines of the first hunk are typed.
    expect(r.current.progress.line).toBe(2);
    act(() => r.current.forward(true));
    expect(r.current.done).toBe(true);
    act(() => r.current.back(true));
    expect(r.current.progress.line).toBe(2);
  });

  it("shows everything at once for files that don't replay", () => {
    const r = setup(false);
    expect(r.current.done).toBe(true);
    expect(r.current.progress).toEqual({ line: 3, lines: 3 });
  });

  it("restarts from the beginning when toggled after finishing", () => {
    const r = setup();
    act(() => r.current.skip());
    expect(r.current.done).toBe(true);
    act(() => r.current.toggle());
    expect(r.current.pos).toBe(0);
    expect(r.current.playing).toBe(true);
  });
});

describe("useReplay after the file changes", () => {
  it("stays finished when the file grows after the replay ended (e.g. the user's own edit)", () => {
    const short = buildRows("", "one\ntwo\n");
    const longer = buildRows("", "one\ntwo\nthree\n");
    const { result, rerender } = renderHook(({ rows }) => useReplay(rows, "same-file#1", true), { initialProps: { rows: short } });
    act(() => result.current.skip());
    rerender({ rows: longer });
    expect(result.current.done).toBe(true);
    expect(result.current.playing).toBe(false);
  });
});
