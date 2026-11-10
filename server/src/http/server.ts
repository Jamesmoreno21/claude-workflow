import { createAdaptorServer } from "@hono/node-server";
import type { Server } from "node:http";
import { createServer } from "node:net";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import { ROUTES } from "../../../shared/constants.js";
import type { RepoRef, ServerMessage, UserEvent } from "../../../shared/protocol.js";
import type { TtsRequest } from "../../../shared/tts.js";
import { BIND_HOST, MAX_SOCKET_MESSAGE_BYTES, PORT_SCAN_RANGE } from "../config/constants.js";
import { settings } from "../config/settings.js";
import type { Workflow } from "../core/workflow.js";
import { fileContents, inspectRepo, readWorking, repoTree, saveFile, SaveConflictError } from "../services/git.js";
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

  /** Runs `handle` with a task repo; unknown repos and paths outside it become a 400. */
  const withRepo = async (name: string | undefined, handle: (repo: RepoRef) => Response | Promise<Response>) => {
    try {
      return await handle(workflow.repo(name ?? ""));
    } catch (err) {
      return new Response((err as Error).message, { status: 400 });
    }
  };

  app.use(async (c, next) => {
    if (!isAllowedHost(c.req.header("host"), port)) return c.text("Forbidden host", 403);
    if (!isAllowedOrigin(c.req.header("origin"), port)) return c.text("Forbidden origin", 403);
    await next();
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "no-referrer");
  });

  app.get(ROUTES.state, (c) => c.json(workflow.store?.state ?? null));
  app.get(ROUTES.ttsProviders, (c) => c.json(availableTtsProviders()));
  app.post(ROUTES.inspectRepo, async (c) => c.json(await inspectRepo((await c.req.json<{ path: string }>()).path ?? "")));
  app.get(ROUTES.tree, (c) => withRepo(c.req.query("repo"), async (repo) => c.json(await repoTree(repo.path))));
  app.get(ROUTES.file, (c) =>
    withRepo(c.req.query("repo"), async (repo) => c.json(await fileContents(repo.path, c.req.query("path") ?? "", repo.role === "change"))),
  );
  app.put(ROUTES.file, async (c) => {
    const body = await c.req.json<{ repo: string; path: string; content: string; base: string }>();
    return withRepo(body.repo, async (repo) => {
      if (repo.role !== "change") return c.text(`${repo.name} is context only; it can't be edited`, 403);
      try {
        await saveFile(repo.path, body.path, body.content, body.base);
      } catch (err) {
        if (err instanceof SaveConflictError) return c.json({ error: err.message, working: readWorking(repo.path, body.path) }, 409);
        throw err;
      }
      workflow.recordUserEdit(repo.name, body.path);
      return c.json({ ok: true });
    });
  });
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
