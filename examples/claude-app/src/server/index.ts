import express from "express";
import { createServer } from "node:http";
import { RunloopSDK } from "@runloop/api-client";
import { ClaudeAxonConnection } from "@runloop/agent-axon-client/claude";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { WsBroadcaster, type WsEvent } from "./ws.ts";

const app = express();
app.use(express.json());

const server = createServer(app);
const ws = new WsBroadcaster(server);

let connection: ClaudeAxonConnection | null = null;
let abortController: AbortController | null = null;
let axonEvents: unknown[] = [];
let initMessage: SDKMessage | null = null;

// Background read loop: streams all SDKMessages to WS clients
async function runReadLoop(conn: ClaudeAxonConnection): Promise<void> {
  console.log("[read-loop] started");
  try {
    for await (const msg of conn.receiveMessages()) {
      const msgType = (msg as any).type;
      const msgSubtype = (msg as any).subtype;
      console.log(
        `[read-loop] received: type=${msgType} subtype=${msgSubtype}`,
      );

      // Capture init message for later reference
      if (msg.type === "system" && msg.subtype === "init") {
        initMessage = msg;
      }

      // Stream every message to connected browsers
      ws.broadcast({ type: "sdk_message", message: msg });

      // When a result arrives, also broadcast turn_complete
      if (msg.type === "result") {
        ws.broadcast({ type: "turn_complete", result: msg });
      }
    }
    console.log("[read-loop] ended (generator returned)");
  } catch (err) {
    console.error("[read-loop] error:", err);
    ws.broadcast({
      type: "turn_error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

app.post("/api/start", async (req, res) => {
  try {
    const { blueprintName, launchCommands, systemPrompt, model } = req.body;

    const apiKey = process.env.RUNLOOP_API_KEY;
    const baseUrl = process.env.RUNLOOP_BASE_URL;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      res.status(500).json({ error: "RUNLOOP_API_KEY not set in server .env" });
      return;
    }

    const sdk = new RunloopSDK({
      bearerToken: apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });

    const axon = await sdk.axon.create({ name: "claude-app" });
    // The runloop/agents blueprint used has Claude pre-installed.
    // When using a ClaudeSDKConnection, ensure the Agent is on the blueprint by
    // using the AgentAPI or a Blueprint.
    const devbox = await sdk.devbox.create({
      blueprint_name: blueprintName ?? "runloop/agents",
      mounts: [
        {
          type: "broker_mount" as const,
          axon_id: axon.id,
          protocol: "claude_json" as const,
          launch_args: [],
        },
      ],
      environment_variables: {
        ...(anthropicApiKey ? { ANTHROPIC_API_KEY: anthropicApiKey } : {}),
      },
      launch_parameters: launchCommands?.length
        ? { launch_commands: launchCommands, keep_alive_time_seconds: 300 }
        : undefined,
    });

    abortController = new AbortController();
    axonEvents = [];

    const conn = new ClaudeAxonConnection(axon, devbox, {
      verbose: true,
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(model ? { model } : {}),
    });

    connection = conn;

    await conn.connect();

    // Start the background read loop
    runReadLoop(conn).catch((err) => {
      console.error("[read-loop] unhandled error:", err);
    });

    res.json({
      devboxId: devbox.id,
      axonId: axon.id,
      runloopUrl: (baseUrl ?? "https://api.runloop.ai").replace(
        "api",
        "platform",
      ),
    });
  } catch (err) {
    console.error("Start error:", err);
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/prompt", async (req, res) => {
  if (!connection) {
    res.status(400).json({ error: "Not connected" });
    return;
  }
  const { text } = req.body;

  // Fire and forget — results stream via WebSocket
  connection.send(text).catch((err) => {
    ws.broadcast({
      type: "turn_error",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  res.json({ ok: true });
});

app.post("/api/cancel", async (_req, res) => {
  if (!connection) {
    res.status(400).json({ error: "Not connected" });
    return;
  }
  try {
    await connection.interrupt();
    res.json({ ok: true });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/set-model", async (req, res) => {
  if (!connection) {
    res.status(400).json({ error: "Not connected" });
    return;
  }
  try {
    const { model } = req.body;
    await connection.setModel(model);
    res.json({ ok: true });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/set-permission-mode", async (req, res) => {
  if (!connection) {
    res.status(400).json({ error: "Not connected" });
    return;
  }
  try {
    const { mode } = req.body;
    await connection.setPermissionMode(mode);
    res.json({ ok: true });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/get-context-usage", async (_req, res) => {
  if (!connection) {
    res.status(400).json({ error: "Not connected" });
    return;
  }
  try {
    const usage = await connection.getContextUsage();
    res.json(usage);
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/get-mcp-status", async (_req, res) => {
  if (!connection) {
    res.status(400).json({ error: "Not connected" });
    return;
  }
  try {
    const status = await connection.getMcpStatus();
    res.json(status);
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/axon-events", (_req, res) => {
  res.json(axonEvents);
});

app.post("/api/shutdown", async (_req, res) => {
  try {
    abortController?.abort();
    if (connection) {
      await connection.disconnect();
    }
    connection = null;
    abortController = null;
    axonEvents = [];
    initMessage = null;
    res.json({ ok: true });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const PORT = process.env.PORT ?? 3002;
server.listen(PORT, () => {
  console.log(`Claude SDK Demo server listening on http://localhost:${PORT}`);
  console.log(`Start the Vite dev server with: npm run dev:client`);
});
