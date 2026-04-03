import express, { type Request, type Response } from "express";
import { createServer } from "node:http";
import { ConnectionManager, HttpError } from "./connection-manager.ts";
import { WsBroadcaster } from "./ws.ts";

const app = express();
app.use(express.json());

const server = createServer(app);
const ws = new WsBroadcaster(server);
const mgr = new ConnectionManager(ws);

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function asyncHandler(fn: AsyncHandler): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : String(err);
      if (status >= 500) console.error("Server error:", err);
      res.status(status).json({ error: message });
    });
  };
}

// --- Lifecycle ---

app.post(
  "/api/start",
  asyncHandler(async (req, res) => {
    res.json(await mgr.start(req.body));
  }),
);

app.post(
  "/api/shutdown",
  asyncHandler(async (_req, res) => {
    await mgr.shutdown();
    res.json({ ok: true });
  }),
);

// --- Prompting ---

app.post(
  "/api/prompt",
  asyncHandler(async (req, res) => {
    const { connection, sessionId } = mgr.requireSession();
    const { text } = req.body;

    connection
      .prompt({ sessionId, prompt: [{ type: "text", text }] })
      .then((resp) => {
        console.log("[prompt] turn complete, stopReason:", resp.stopReason);
        ws.broadcast({ type: "turn_complete", ...resp });
      })
      .catch((err) => {
        console.error("[prompt] turn error:", err);
        ws.broadcast({
          type: "turn_error",
          error: err instanceof Error ? err.message : String(err),
        });
      });

    res.json({ ok: true });
  }),
);

app.post(
  "/api/cancel",
  asyncHandler(async (_req, res) => {
    const { connection, sessionId } = mgr.requireSession();
    await connection.cancel({ sessionId });
    res.json({ ok: true });
  }),
);

// --- Session configuration ---

app.post(
  "/api/set-mode",
  asyncHandler(async (req, res) => {
    const { connection, sessionId } = mgr.requireSession();
    const { modeId } = req.body;
    res.json(await connection.setSessionMode({ sessionId, modeId }));
  }),
);

app.post(
  "/api/set-config-option",
  asyncHandler(async (req, res) => {
    const { connection, sessionId } = mgr.requireSession();
    const { configId, value } = req.body;
    res.json(
      await connection.setSessionConfigOption({ sessionId, configId, value }),
    );
  }),
);

app.post(
  "/api/set-model",
  asyncHandler(async (req, res) => {
    const { connection, sessionId } = mgr.requireSession();
    const { modelId } = req.body;
    res.json(
      await connection.unstable_setSessionModel({ sessionId, modelId }),
    );
  }),
);

// --- Auth & elicitation ---

app.post(
  "/api/authenticate",
  asyncHandler(async (req, res) => {
    const connection = mgr.requireConnection();
    const { methodId } = req.body;
    res.json(await connection.authenticate({ methodId }));
  }),
);

app.post(
  "/api/elicitation-response",
  asyncHandler(async (req, res) => {
    const client = mgr.requireClient();
    const { requestId, action } = req.body;
    client.resolveElicitation(requestId, { action });
    res.json({ ok: true });
  }),
);

// --- Session management ---

app.post(
  "/api/new-session",
  asyncHandler(async (_req, res) => {
    const connection = mgr.requireConnection();
    const resp = await connection.newSession({
      cwd: "/home/user",
      mcpServers: [],
    });
    mgr.activeSessionId = resp.sessionId;
    const raw = resp as Record<string, unknown>;
    res.json({
      sessionId: resp.sessionId,
      modes: raw.modes,
      configOptions: raw.configOptions,
      models: raw.models,
    });
  }),
);

app.post(
  "/api/switch-session",
  asyncHandler(async (req, res) => {
    const connection = mgr.requireConnection();
    const { sessionId } = req.body;
    const resp = await connection.loadSession({
      sessionId,
      cwd: "/home/user",
      mcpServers: [],
    });
    mgr.activeSessionId = sessionId;
    res.json(resp);
  }),
);

app.get(
  "/api/sessions",
  asyncHandler(async (_req, res) => {
    const connection = mgr.requireConnection();
    res.json(await connection.listSessions({}));
  }),
);

// --- Debug ---

app.get("/api/axon-events", (_req, res) => {
  res.json(mgr.axonEvents);
});

// --- Start server ---

const PORT = process.env.PORT ?? 3001;
server.listen(PORT, () => {
  console.log(`Node ACP Demo server listening on http://localhost:${PORT}`);
  console.log(`Start the Vite dev server with: npm run dev:client`);
});
