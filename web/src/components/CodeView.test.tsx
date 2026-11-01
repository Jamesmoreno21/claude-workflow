import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRows, useReplay } from "./CodeView";

const lines = (n: number, prefix = "line") => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join("\n") + "\n";

describe("buildRows", () => {
  it("shows every line of a new file as added", () => {
    const rows = buildRows("", "a\nb\n");
    expect(rows.map((r) => [r.kind, r.text, r.newNo])).toEqual([
      ["add", "a", 1],
      ["add", "b", 2],
    ]);
  });

  it("folds unchanged stretches far from any change", () => {
    const before = lines(30);
    const after = before.replace("line 15\n", "line fifteen\n");
    const rows = buildRows(before, after, 2);
    expect(rows[0]).toMatchObject({ kind: "fold", hidden: 12 });
    expect(rows.filter((r) => r.kind !== "fold").map((r) => r.text)).toEqual([
      "line 13",
      "line 14",
      "line 15",
      "line fifteen",
      "line 16",
      "line 17",
    ]);
    expect(rows.at(-1)).toMatchObject({ kind: "fold", hidden: 13 });
  });

  it("keeps requested lines visible so findings always have an anchor", () => {
    const before = lines(30);
    const after = before.replace("line 15\n", "line fifteen\n");
    const rows = buildRows(before, after, 0, [3]);
    expect(rows.some((r) => r.kind === "ctx" && r.newNo === 3)).toBe(true);
  });
});

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
