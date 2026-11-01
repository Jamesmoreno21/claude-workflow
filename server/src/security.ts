// The cockpit can approve code and publish PRs, so only the cockpit itself may
// talk to this server: not other websites, and not DNS-rebinding tricks.

/** Extra origin allowed during UI development (e.g. Vite on :5173). */
const devOrigin = () => process.env.WORKFLOW_DEV_ORIGIN;

export function allowedHosts(port: number) {
  return new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
}

/** Host header must be ours; blocks DNS rebinding. */
export function isAllowedHost(host: string | undefined, port: number) {
  return !!host && allowedHosts(port).has(host);
}

/** Origin must be ours (browsers always send it on WebSocket and cross-site requests). */
export function isAllowedOrigin(origin: string | undefined, port: number) {
  if (!origin) return true; // non-browser clients, e.g. curl from this machine
  if (origin === devOrigin()) return true;
  try {
    return allowedHosts(port).has(new URL(origin).host);
  } catch {
    return false;
  }
}

/**
 * Content-Security-Policy for the UI. Kokoro needs the ONNX runtime from
 * jsDelivr and its model from Hugging Face; mermaid needs inline styles.
 */
export function contentSecurityPolicy(port: number) {
  const ws = [...allowedHosts(port)].map((h) => `ws://${h}`).join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    `connect-src 'self' ${ws} https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}
