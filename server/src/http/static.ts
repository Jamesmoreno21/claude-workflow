import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { Context } from "hono";
import { MIME_TYPES } from "../config/constants.js";
import { paths } from "../config/paths.js";
import { contentSecurityPolicy } from "./security.js";

/** Serves the built UI; unknown paths fall back to index.html. */
export function serveCockpit(c: Context, port: number) {
  const relativePath = normalize(c.req.path).replace(/^(\.\.[/\\])+/, "");
  let file = join(paths.webDist, relativePath);
  if (relativePath === "/" || !existsSync(file)) file = join(paths.webDist, "index.html");
  if (!existsSync(file)) return c.text("UI not built. Run `npm run build` in claude-workflow.", 500);

  const headers: Record<string, string> = {
    "content-type": MIME_TYPES[extname(file)] ?? "application/octet-stream",
    // Cross-origin isolation lets the voice model run on several CPU threads.
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "credentialless",
  };
  if (file.endsWith(".html")) headers["content-security-policy"] = contentSecurityPolicy(port);
  return c.body(readFileSync(file), 200, headers);
}
