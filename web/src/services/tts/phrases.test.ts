import { describe, expect, it } from "vitest";
import { splitPhrases } from "./phrases";

describe("splitPhrases", () => {
  it("splits by sentence and keeps short ones whole", () => {
    expect(splitPhrases("Here's the plan. We add a limiter! Done?")).toEqual(["Here's the plan.", "We add a limiter!", "Done?"]);
  });

  it("keeps the first phrase short so audio starts quickly", () => {
    const text = "We'll count failed logins per email and per IP in Redis, and once either hits five we lock with backoff. Next.";
    const [first, ...rest] = splitPhrases(text);
    expect(first.length).toBeLessThanOrEqual(70);
    expect([first, ...rest].join(" ")).toBe(text);
  });

  it("breaks long sentences at commas without losing words", () => {
    const long = Array.from({ length: 12 }, (_, i) => `clause number ${i}`).join(", ") + ".";
    const phrases = splitPhrases(`Intro. ${long}`);
    expect(phrases.every((p) => p.length <= 160)).toBe(true);
    expect(phrases.join(" ")).toBe(`Intro. ${long}`);
  });
});
