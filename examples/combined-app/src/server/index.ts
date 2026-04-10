import express, { type Request, type Response } from "express";
import { createServer } from "node:http";
import { ACPConnectionManager } from "./acp-manager.ts";
import { ClaudeConnectionManager } from "./claude-manager.ts";
import { HttpError } from "./http-errors.ts";
import { WsBroadcaster } from "./ws.ts";

const app = express();
app.use(express.json());

const server = createServer(app);
const ws = new WsBroadcaster(server);

let activeAgentType: "claude" | "acp" | null = null;
let claudeManager: ClaudeConnectionManager | null = null;
let acpManager: ACPConnectionManager | null = null;

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
    const { agentType, ...config } = req.body;

    // Shutdown any existing connection
    if (claudeManager) {
      await claudeManager.shutdown();
      claudeManager = null;
    }
    if (acpManager) {
      await acpManager.shutdown();
      acpManager = null;
    }

    if (agentType === "claude") {
      activeAgentType = "claude";
      claudeManager = new ClaudeConnectionManager(ws);
      const result = await claudeManager.start(config);
      res.json({ agentType: "claude", ...result });
    } else {
      activeAgentType = "acp";
      acpManager = new ACPConnectionManager(ws);
      const result = await acpManager.start(config);
      res.json({ agentType: "acp", ...result });
    }
  }),
);

app.post(
  "/api/shutdown",
  asyncHandler(async (_req, res) => {
    if (claudeManager) {
      await claudeManager.shutdown();
      claudeManager = null;
    }
    if (acpManager) {
      await acpManager.shutdown();
      acpManager = null;
    }
    activeAgentType = null;
    res.json({ ok: true });
  }),
);

// --- Prompting ---

app.post(
  "/api/prompt",
  asyncHandler(async (req, res) => {
    if (activeAgentType === "claude") {
      if (!claudeManager?.connection) {
        res.status(400).json({ error: "Not connected" });
        return;
      }
      const { content, text } = req.body;

      let prompt: string | Record<string, unknown>;

      if (Array.isArray(content) && content.some((c: Record<string, unknown>) => c.type !== "text")) {
        const blocks: unknown[] = content.map((item: Record<string, unknown>) => {
          switch (item.type) {
            case "image":
              return {
                type: "image",
                source: { type: "base64", media_type: item.mimeType, data: item.data },
              };
            case "file":
              return { type: "text", text: `--- ${item.name} ---\n${item.text}` };
            default:
              return { type: "text", text: item.text ?? "" };
          }
        });
        prompt = {
          type: "user",
          message: { role: "user", content: blocks },
          parent_tool_use_id: null,
        };
      } else {
        prompt = text ?? content?.[0]?.text ?? "";
      }

      claudeManager.send(prompt).catch((err: unknown) => {
        ws.broadcast({
          type: "turn_error",
          error: err instanceof Error ? err.message : String(err),
        });
      });

      res.json({ ok: true });
    } else if (activeAgentType === "acp") {
      const { connection, sessionId } = acpManager!.requireSession();
      const { content, text } = req.body;

      const contentItems: Record<string, unknown>[] =
        Array.isArray(content) ? content : [{ type: "text", text }];

      const prompt = contentItems.map((item) => {
        switch (item.type) {
          case "image":
            return { type: "image" as const, data: item.data as string, mimeType: item.mimeType as string };
          case "file":
            return {
              type: "resource" as const,
              resource: { uri: `file:///${item.name}`, text: item.text as string, mimeType: item.mimeType as string },
            };
          default:
            return { type: "text" as const, text: (item.text ?? "") as string };
        }
      });

      connection
        .prompt({ sessionId, prompt })
        .then((resp) => {
          console.log("[prompt] turn complete, stopReason:", resp.stopReason);
          ws.broadcast({ type: "turn_complete", ...resp } as any);
        })
        .catch((err) => {
          console.error("[prompt] turn error:", err);
          ws.broadcast({
            type: "turn_error",
            error: err instanceof Error ? err.message : String(err),
          });
        });

      res.json({ ok: true });
    } else {
      res.status(400).json({ error: "Not connected" });
    }
  }),
);

app.post(
  "/api/cancel",
  asyncHandler(async (_req, res) => {
    if (activeAgentType === "claude") {
      await claudeManager!.interrupt();
    } else if (activeAgentType === "acp") {
      const { connection, sessionId } = acpManager!.requireSession();
      await connection.cancel({ sessionId });
    } else {
      res.status(400).json({ error: "Not connected" });
      return;
    }
    res.json({ ok: true });
  }),
);

// --- Claude-specific ---

app.post(
  "/api/control-response",
  asyncHandler(async (req, res) => {
    if (activeAgentType !== "claude" || !claudeManager) {
      res.status(400).json({ error: "Not a Claude session" });
      return;
    }
    const { requestId, response } = req.body;
    if (!requestId) {
      res.status(400).json({ error: "requestId is required" });
      return;
    }
    if (!claudeManager.resolveControlResponse(requestId, response)) {
      res.status(404).json({ error: `No pending control request with id ${requestId}` });
      return;
    }
    res.json({ ok: true });
  }),
);

app.post("/api/set-model", asyncHandler(async (req, res) => {
  if (activeAgentType === "claude") {
    await claudeManager!.setModel(req.body.model ?? req.body.modelId);
    res.json({ ok: true });
  } else if (activeAgentType === "acp") {
    const { connection, sessionId } = acpManager!.requireSession();
    res.json(await connection.unstable_setSessionModel({ sessionId, modelId: req.body.modelId }));
  } else {
    res.status(400).json({ error: "Not connected" });
  }
}));

app.post("/api/set-permission-mode", asyncHandler(async (req, res) => {
  if (activeAgentType !== "claude" || !claudeManager) {
    res.status(400).json({ error: "Not a Claude session" });
    return;
  }
  await claudeManager.setPermissionMode(req.body.mode);
  res.json({ ok: true });
}));

app.post("/api/set-auto-approve-permissions", (req, res) => {
  const { enabled } = req.body;
  if (activeAgentType === "acp" && acpManager?.nodeClient) {
    acpManager.nodeClient.autoApprovePermissions = !!enabled;
  }
  res.json({ ok: true, autoApprovePermissions: !!enabled });
});

// --- ACP-specific ---

app.post("/api/set-mode", asyncHandler(async (req, res) => {
  if (activeAgentType !== "acp") {
    res.status(400).json({ error: "Not an ACP session" });
    return;
  }
  const { connection, sessionId } = acpManager!.requireSession();
  res.json(await connection.setSessionMode({ sessionId, modeId: req.body.modeId }));
}));

app.post("/api/set-config-option", asyncHandler(async (req, res) => {
  if (activeAgentType !== "acp") {
    res.status(400).json({ error: "Not an ACP session" });
    return;
  }
  const { connection, sessionId } = acpManager!.requireSession();
  res.json(await connection.setSessionConfigOption({ sessionId, configId: req.body.configId, value: req.body.value }));
}));

app.post("/api/permission-response", asyncHandler(async (req, res) => {
  if (activeAgentType !== "acp") {
    res.status(400).json({ error: "Not an ACP session" });
    return;
  }
  const client = acpManager!.requireClient();
  client.resolvePermission(req.body.requestId, { outcome: req.body.outcome });
  res.json({ ok: true });
}));

app.post("/api/elicitation-response", asyncHandler(async (req, res) => {
  if (activeAgentType !== "acp") {
    res.status(400).json({ error: "Not an ACP session" });
    return;
  }
  const client = acpManager!.requireClient();
  client.resolveElicitation(req.body.requestId, { action: req.body.action });
  res.json({ ok: true });
}));

app.post("/api/authenticate", asyncHandler(async (req, res) => {
  if (activeAgentType !== "acp") {
    res.status(400).json({ error: "Not an ACP session" });
    return;
  }
  const connection = acpManager!.requireConnection();
  res.json(await connection.authenticate({ methodId: req.body.methodId }));
}));

app.post("/api/new-session", asyncHandler(async (_req, res) => {
  if (activeAgentType !== "acp") {
    res.status(400).json({ error: "Not an ACP session" });
    return;
  }
  const connection = acpManager!.requireConnection();
  const resp = await connection.newSession({ cwd: "/home/user", mcpServers: [] });
  acpManager!.activeSessionId = resp.sessionId;
  const raw = resp as Record<string, unknown>;
  res.json({ sessionId: resp.sessionId, modes: raw.modes, configOptions: raw.configOptions, models: raw.models });
}));

app.post("/api/switch-session", asyncHandler(async (req, res) => {
  if (activeAgentType !== "acp") {
    res.status(400).json({ error: "Not an ACP session" });
    return;
  }
  const connection = acpManager!.requireConnection();
  const resp = await connection.loadSession({ sessionId: req.body.sessionId, cwd: "/home/user", mcpServers: [] });
  acpManager!.activeSessionId = req.body.sessionId;
  res.json(resp);
}));

app.get("/api/sessions", asyncHandler(async (_req, res) => {
  if (activeAgentType !== "acp") {
    res.status(400).json({ error: "Not an ACP session" });
    return;
  }
  const connection = acpManager!.requireConnection();
  res.json(await connection.listSessions({}));
}));

// --- Debug ---

app.get("/api/axon-events", (_req, res) => {
  const events = activeAgentType === "claude"
    ? claudeManager?.axonEvents ?? []
    : acpManager?.axonEvents ?? [];
  res.json(events);
});

// --- Start server ---

const PORT = process.env.PORT ?? 3003;
server.listen(PORT, () => {
  console.log(`Combined App server listening on http://localhost:${PORT}`);
  console.log(`Start the Vite dev server with: bun run dev:client`);
  console.log(`RUNLOOP_API_KEY: ${process.env.RUNLOOP_API_KEY ? "set" : "NOT SET"}`);
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "set" : "NOT SET"}`);
});
