import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./Markdown";

describe("renderMarkdown", () => {
  it("strips scripts and event handlers from untrusted task text", () => {
    const html = renderMarkdown('Hi <img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(html).not.toMatch(/onerror|<script/i);
  });

  it("drops javascript: links but keeps safe ones, opening in a new tab", () => {
    const html = renderMarkdown("[bad](javascript:alert(1)) [docs](https://nodejs.org)");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://nodejs.org"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });
});
