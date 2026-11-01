import { createAdaptorServer } from "@hono/node-server";
import type { Server } from "node:http";
import { createServer } from "node:net";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import { ROUTES } from "../../../shared/constants.js";
import type { ServerMessage, UserEvent } from "../../../shared/protocol.js";
import type { TtsRequest } from "../../../shared/tts.js";
import { BIND_HOST, MAX_SOCKET_MESSAGE_BYTES, PORT_SCAN_RANGE } from "../config/constants.js";
import { settings } from "../config/settings.js";
import type { Workflow } from "../core/workflow.js";
import { availableTtsProviders, synthesize } from "../services/tts.js";
import { isAllowedHost, isAllowedOrigin } from "./security.js";
import { serveCockpit } from "./static.js";

async function freePort(start: number): Promise<number> {
  for (let port = start; port < start + PORT_SCAN_RANGE; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer()
        .once("error", () => resolve(false))
        .once("listening", () => probe.close(() => resolve(true)))
        .listen(port, BIND_HOST);
    });
    if (free) return port;
  }
  throw new Error(`No free port in ${start}-${start + PORT_SCAN_RANGE}`);
}

/** Serves the cockpit UI, its WebSocket and the TTS proxy. Returns its URL. */
export async function startCockpitServer(workflow: Workflow): Promise<string> {
  const port = await freePort(settings.port);
  const app = new Hono();

  app.use(async (c, next) => {
    if (!isAllowedHost(c.req.header("host"), port)) return c.text("Forbidden host", 403);
    if (!isAllowedOrigin(c.req.header("origin"), port)) return c.text("Forbidden origin", 403);
    await next();
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "no-referrer");
  });

  app.get(ROUTES.state, (c) => c.json(workflow.store?.state ?? null));
  app.get(ROUTES.ttsProviders, (c) => c.json(availableTtsProviders()));
  app.post(ROUTES.tts, async (c) => {
    try {
      const audio = await synthesize(await c.req.json<TtsRequest>());
      return c.body(audio, 200, { "content-type": "audio/mpeg" });
    } catch (err) {
      return c.text((err as Error).message, 502);
    }
  });
  app.get("*", (c) => serveCockpit(c, port));

  const server = createAdaptorServer({ fetch: app.fetch }) as Server;
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_SOCKET_MESSAGE_BYTES });

  server.on("upgrade", (req, socket, head) => {
    // Browsers let any page open a WebSocket to localhost; only the cockpit may.
    const trusted = isAllowedHost(req.headers.host, port) && isAllowedOrigin(req.headers.origin, port);
    if (req.url !== ROUTES.socket || !trusted) return socket.destroy();
    sockets.handleUpgrade(req, socket, head, (ws) => {
      const unsubscribe = workflow.store!.subscribe((state) => {
        const message: ServerMessage = { type: "state", state };
        ws.send(JSON.stringify(message));
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

  await new Promise<void>((resolve) => server.listen(port, BIND_HOST, resolve));
  return `http://localhost:${port}`;
}
