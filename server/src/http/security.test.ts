import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { insideRepo } from "../services/git.js";
import { isAllowedHost, isAllowedOrigin } from "./security.js";

describe("origin and host checks", () => {
  it("accepts only the cockpit's own origin", () => {
    expect(isAllowedOrigin("http://localhost:4545", 4545)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4545", 4545)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", 4545)).toBe(false);
    expect(isAllowedOrigin("http://localhost:9999", 4545)).toBe(false);
    expect(isAllowedOrigin("null", 4545)).toBe(false);
  });

  it("rejects DNS-rebinding hosts", () => {
    expect(isAllowedHost("localhost:4545", 4545)).toBe(true);
    expect(isAllowedHost("evil.example:4545", 4545)).toBe(false);
    expect(isAllowedHost(undefined, 4545)).toBe(false);
  });
});

describe("insideRepo", () => {
  const repo = mkdtempSync(join(tmpdir(), "wf-sec-"));

  it("resolves paths inside the repo", () => {
    expect(insideRepo(repo, "src/a.ts")).toBe(join(repo, "src/a.ts"));
  });

  it("refuses paths that escape it", () => {
    expect(() => insideRepo(repo, "../../.ssh/id_rsa")).toThrow(/outside/);
    expect(() => insideRepo(repo, "/etc/passwd")).toThrow(/outside/);
    expect(() => insideRepo(repo, ".")).toThrow(/outside/);
  });
});
