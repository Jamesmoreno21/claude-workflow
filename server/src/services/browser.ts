import { execFile } from "node:child_process";

/** Opens a URL in the user's default browser (no shell involved). */
export function openInBrowser(url: string) {
  execFile(process.platform === "darwin" ? "open" : "xdg-open", [url]);
}
