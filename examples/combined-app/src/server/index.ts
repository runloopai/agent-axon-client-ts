import express, { type Request, type Response } from "express";
import { createServer } from "node:http";
import { WsBroadcaster } from "./ws.ts";
import { ClaudeConnectionManager } from "./claude-manager.ts";
import { ACPConnectionManager } from "./acp-manager.ts";
import { AgentRegistry } from "./agent-registry.ts";

const app = express();
app.use(express.json());

const server = createServer(app);
const ws = new WsBroadcaster(server);
const registry = new AgentRegistry();

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function asyncHandler(fn: AsyncHandler): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((err) => {
      const status = 500;
      const message = err instanceof Error ? err.message : String(err);
      console.error("Server error:", err);
      res.status(status).json({ error: message });
    });
  };
}

function requireAgent(req: Request, res: Response) {
  const agentId = req.body?.agentId ?? req.query?.agentId;
  if (!agentId) {
    res.status(400).json({ error: "agentId is required" });
    return null;
  }
  const entry = registry.get(agentId as string);
  if (!entry) {
    res.status(404).json({ error: `Agent ${agentId} not found` });
    return null;
  }
  return entry;
}

// --- Agent list ---

app.get("/api/agents", (_req, res) => {
  res.json({ agents: registry.list() });
});

// --- Subscribe (reconnect to existing agent's event stream) ---

app.post(
  "/api/subscribe",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;

    if (entry.agentType === "claude" && entry.claudeManager) {
      await entry.claudeManager.subscribe();
    } else if (entry.agentType === "acp" && entry.acpManager) {
      await entry.acpManager.subscribe();
    }
    res.json({ ok: true });
  }),
);

// --- Lifecycle ---

app.post(
  "/api/start",
  asyncHandler(async (req, res) => {
    const { agentType, ...config } = req.body;
    const agentId = registry.generateId();

    if (agentType === "claude") {
      const manager = new ClaudeConnectionManager(ws, agentId);
      const result = await manager.start(config);
      registry.add({
        id: agentId,
        agentType: "claude",
        name: config.blueprintName ?? "Claude Agent",
        axonId: result.axonId,
        devboxId: result.devboxId,
        createdAt: Date.now(),
        claudeManager: manager,
      });
      manager.connection
        ?.publish({
          event_type: "agent_started",
          origin: "USER_EVENT",
          payload: JSON.stringify({ agentType: "claude", agentId, ...config }),
          source: "combined-app",
        })
        .catch((err: unknown) =>
          console.error("[agent_started] publish failed:", err),
        );
      res.json({ agentId, agentType: "claude", ...result });
    } else {
      const manager = new ACPConnectionManager(ws, agentId);
      const result = await manager.start(config);
      registry.add({
        id: agentId,
        agentType: "acp",
        name: config.agentBinary ?? "ACP Agent",
        axonId: result.axonId,
        devboxId: result.devboxId,
        createdAt: Date.now(),
        acpManager: manager,
      });
      manager.connection
        ?.publish({
          event_type: "agent_started",
          origin: "USER_EVENT",
          payload: JSON.stringify({ agentType: "acp", agentId, ...config }),
          source: "combined-app",
        })
        .catch((err: unknown) =>
          console.error("[agent_started] publish failed:", err),
        );
      res.json({ agentId, agentType: "acp", ...result });
    }
  }),
);

app.post(
  "/api/shutdown",
  asyncHandler(async (req, res) => {
    const { agentId } = req.body;
    if (!agentId) {
      // Shutdown all agents
      await registry.shutdownAll();
      res.json({ ok: true });
      return;
    }
    await registry.shutdown(agentId);
    res.json({ ok: true });
  }),
);

// --- Prompting ---

app.post(
  "/api/prompt",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;

    if (entry.agentType === "claude") {
      const manager = entry.claudeManager!;
      if (!manager.connection) {
        res.status(400).json({ error: "Not connected" });
        return;
      }
      const { content, text } = req.body;

      let prompt: string | Record<string, unknown>;

      if (
        Array.isArray(content) &&
        content.some((c: Record<string, unknown>) => c.type !== "text")
      ) {
        const blocks: unknown[] = content.map(
          (item: Record<string, unknown>) => {
            switch (item.type) {
              case "image":
                return {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: item.mimeType,
                    data: item.data,
                  },
                };
              case "file":
                return {
                  type: "text",
                  text: `--- ${item.name} ---\n${item.text}`,
                };
              default:
                return { type: "text", text: item.text ?? "" };
            }
          },
        );
        prompt = {
          type: "user",
          message: { role: "user", content: blocks },
          parent_tool_use_id: null,
        };
      } else {
        prompt = text ?? content?.[0]?.text ?? "";
      }

      manager.send(prompt).catch((err: unknown) => {
        ws.broadcast({
          type: "turn_error",
          agentId: entry.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      res.json({ ok: true });
    } else {
      const manager = entry.acpManager!;
      const connection = manager.requireConnection();
      const sessionId = manager.activeSessionId;
      if (!sessionId) {
        res.status(400).json({ error: "No active session" });
        return;
      }
      const { content, text } = req.body;

      const contentItems: Record<string, unknown>[] = Array.isArray(content)
        ? content
        : [{ type: "text", text }];

      const prompt = contentItems.map((item) => {
        switch (item.type) {
          case "image":
            return {
              type: "image" as const,
              data: item.data as string,
              mimeType: item.mimeType as string,
            };
          case "file":
            return {
              type: "resource" as const,
              resource: {
                uri: `file:///${item.name}`,
                text: item.text as string,
                mimeType: item.mimeType as string,
              },
            };
          default:
            return { type: "text" as const, text: (item.text ?? "") as string };
        }
      });

      connection
        .prompt({ sessionId, prompt })
        .then((resp) => {
          console.log("[prompt] turn complete, stopReason:", resp.stopReason);
        })
        .catch((err) => {
          console.error("[prompt] turn error:", err);
          ws.broadcast({
            type: "turn_error",
            agentId: entry.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });

      res.json({ ok: true });
    }
  }),
);

app.post(
  "/api/cancel",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;

    if (entry.agentType === "claude") {
      await entry.claudeManager!.interrupt();
    } else {
      const { connection, sessionId } = entry.acpManager!.requireSession();
      await connection.cancel({ sessionId });
    }
    res.json({ ok: true });
  }),
);

// --- Claude-specific ---

app.post(
  "/api/control-response",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;
    if (entry.agentType !== "claude" || !entry.claudeManager) {
      res.status(400).json({ error: "Not a Claude session" });
      return;
    }
    const { requestId, response } = req.body;
    if (!requestId) {
      res.status(400).json({ error: "requestId is required" });
      return;
    }
    if (!entry.claudeManager.resolveControlResponse(requestId, response)) {
      res
        .status(404)
        .json({ error: `No pending control request with id ${requestId}` });
      return;
    }
    res.json({ ok: true });
  }),
);

app.post(
  "/api/set-model",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;

    if (entry.agentType === "claude") {
      await entry.claudeManager!.setModel(req.body.model ?? req.body.modelId);
      res.json({ ok: true });
    } else {
      const { connection, sessionId } = entry.acpManager!.requireSession();
      res.json(
        await connection.protocol.unstable_setSessionModel({
          sessionId,
          modelId: req.body.modelId,
        }),
      );
    }
  }),
);

app.post(
  "/api/set-permission-mode",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;
    if (entry.agentType !== "claude" || !entry.claudeManager) {
      res.status(400).json({ error: "Not a Claude session" });
      return;
    }
    await entry.claudeManager.setPermissionMode(req.body.mode);
    res.json({ ok: true });
  }),
);

app.post("/api/set-auto-approve-permissions", (req, res) => {
  const entry = requireAgent(req, res);
  if (!entry) return;

  const { enabled } = req.body;
  if (entry.agentType === "acp" && entry.acpManager?.nodeClient) {
    entry.acpManager.nodeClient.autoApprovePermissions = !!enabled;
  }
  res.json({ ok: true, autoApprovePermissions: !!enabled });
});

// --- ACP-specific ---

app.post(
  "/api/set-mode",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;
    if (entry.agentType !== "acp") {
      res.status(400).json({ error: "Not an ACP session" });
      return;
    }
    const { connection, sessionId } = entry.acpManager!.requireSession();
    res.json(
      await connection.setSessionMode({ sessionId, modeId: req.body.modeId }),
    );
  }),
);

app.post(
  "/api/set-config-option",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;
    if (entry.agentType !== "acp") {
      res.status(400).json({ error: "Not an ACP session" });
      return;
    }
    const { connection, sessionId } = entry.acpManager!.requireSession();
    res.json(
      await connection.setSessionConfigOption({
        sessionId,
        configId: req.body.configId,
        value: req.body.value,
      }),
    );
  }),
);

app.post(
  "/api/permission-response",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;
    if (entry.agentType !== "acp") {
      res.status(400).json({ error: "Not an ACP session" });
      return;
    }
    entry
      .acpManager!.requireClient()
      .resolvePermission(req.body.requestId, { outcome: req.body.outcome });
    res.json({ ok: true });
  }),
);

app.post(
  "/api/elicitation-response",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;
    if (entry.agentType !== "acp") {
      res.status(400).json({ error: "Not an ACP session" });
      return;
    }
    entry
      .acpManager!.requireClient()
      .resolveElicitation(req.body.requestId, { action: req.body.action });
    res.json({ ok: true });
  }),
);

app.post(
  "/api/authenticate",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;
    if (entry.agentType !== "acp") {
      res.status(400).json({ error: "Not an ACP session" });
      return;
    }
    res.json(
      await entry
        .acpManager!.requireConnection()
        .authenticate({ methodId: req.body.methodId }),
    );
  }),
);

app.post(
  "/api/new-session",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;
    if (entry.agentType !== "acp") {
      res.status(400).json({ error: "Not an ACP session" });
      return;
    }
    const connection = entry.acpManager!.requireConnection();
    const resp = await connection.newSession({
      cwd: "/home/user",
      mcpServers: [],
    });
    entry.acpManager!.activeSessionId = resp.sessionId;
    res.json({
      sessionId: resp.sessionId,
      modes: resp.modes,
      configOptions: resp.configOptions,
      models: resp.models,
    });
  }),
);

app.post(
  "/api/switch-session",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;
    if (entry.agentType !== "acp") {
      res.status(400).json({ error: "Not an ACP session" });
      return;
    }
    const connection = entry.acpManager!.requireConnection();
    const resp = await connection.loadSession({
      sessionId: req.body.sessionId,
      cwd: "/home/user",
      mcpServers: [],
    });
    entry.acpManager!.activeSessionId = req.body.sessionId;
    res.json(resp);
  }),
);

app.get(
  "/api/sessions",
  asyncHandler(async (req, res) => {
    const entry = requireAgent(req, res);
    if (!entry) return;
    if (entry.agentType !== "acp") {
      res.status(400).json({ error: "Not an ACP session" });
      return;
    }
    res.json(await entry.acpManager!.requireConnection().listSessions({}));
  }),
);

// --- Debug ---

app.get("/api/axon-events", (req, res) => {
  const agentId = req.query.agentId as string | undefined;
  if (!agentId) {
    res.json([]);
    return;
  }
  const entry = registry.get(agentId);
  if (!entry) {
    res.json([]);
    return;
  }
  const events =
    entry.agentType === "claude"
      ? (entry.claudeManager?.axonEvents ?? [])
      : (entry.acpManager?.axonEvents ?? []);
  res.json(events);
});

// --- Start server ---

const PORT = process.env.PORT ?? 3003;
server.listen(PORT, () => {
  console.log(`Combined App server listening on http://localhost:${PORT}`);
  console.log(`Start the Vite dev server with: bun run dev:client`);
  console.log(
    `RUNLOOP_API_KEY: ${process.env.RUNLOOP_API_KEY ? "set" : "NOT SET"}`,
  );
  console.log(
    `ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "set" : "NOT SET"}`,
  );
});
