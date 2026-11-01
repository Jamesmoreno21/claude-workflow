import { createAdaptorServer } from "@hono/node-server";
import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:net";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import type { ServerMessage, UserEvent } from "../../shared/protocol.js";
import { synthesize, ttsProviders, type TtsRequest } from "./tts.js";
import type { Workflow } from "./workflow.js";

// dist/server/src/http.js -> repo root -> web/dist
const WEB_DIST = join(dirname(fileURLToPath(import.meta.url)), "../../../../web/dist");

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

async function freePort(start: number): Promise<number> {
  for (let port = start; port < start + 50; port++) {
    const ok = await new Promise<boolean>((res) => {
      const srv = createServer()
        .once("error", () => res(false))
        .once("listening", () => srv.close(() => res(true)))
        .listen(port, "127.0.0.1");
    });
    if (ok) return port;
  }
  throw new Error("No free port found");
}

export async function startUi(workflow: Workflow): Promise<string> {
  const app = new Hono();

  app.get("/api/state", (c) => c.json(workflow.store?.state ?? null));

  app.get("/api/tts/providers", (c) => c.json(ttsProviders()));

  app.post("/api/tts", async (c) => {
    // Only the cockpit itself may spend the user's TTS credits.
    const origin = c.req.header("origin");
    if (origin && new URL(origin).host !== c.req.header("host")) return c.text("Forbidden", 403);
    try {
      const audio = await synthesize(await c.req.json<TtsRequest>());
      return c.body(audio, 200, { "content-type": "audio/mpeg" });
    } catch (err) {
      return c.text((err as Error).message, 502);
    }
  });

  app.get("*", (c) => {
    const rel = normalize(c.req.path).replace(/^(\.\.[/\\])+/, "");
    let file = join(WEB_DIST, rel);
    if (!existsSync(file) || rel === "/") file = join(WEB_DIST, "index.html");
    if (!existsSync(file)) return c.text("UI not built. Run `npm run build` in claude-workflow.", 500);
    return c.body(readFileSync(file), 200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  });

  const server = createAdaptorServer({ fetch: app.fetch }) as Server;
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url !== "/ws") return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      const unsubscribe = workflow.store!.subscribe((state) => {
        const msg: ServerMessage = { type: "state", state };
        ws.send(JSON.stringify(msg));
      });
      ws.on("message", (raw) => {
        try {
          workflow.handleEvent(JSON.parse(String(raw)) as UserEvent);
        } catch (err) {
          console.error("[workflow] bad event", err);
        }
      });
      ws.on("close", unsubscribe);
    });
  });

  const port = await freePort(Number(process.env.WORKFLOW_PORT ?? 4545));
  await new Promise<void>((res) => server.listen(port, "127.0.0.1", res));
  return `http://localhost:${port}`;
}
