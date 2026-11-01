import { describe, expect, it } from "vitest";
import { buildRows } from "./diff";

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
