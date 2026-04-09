import { RunloopSDK } from "@runloop/api-client";
import {
  ACPAxonConnection,
  PROTOCOL_VERSION,
  type ACPTimelineEvent,
  type AxonEventView,
} from "@runloop/agent-axon-client/acp";
import { NodeACPClient } from "./acp-client.ts";
import type { WsBroadcaster } from "./ws.ts";

export interface StartOptions {
  agentBinary?: string;
  launchArgs?: string[];
  launchCommands?: string[];
  systemPrompt?: string;
}

const CLIENT_CAPABILITIES = {
  elicitation: { form: {} },
} as const;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class ConnectionManager {
  connection: ACPAxonConnection | null = null;
  nodeClient: NodeACPClient | null = null;
  activeSessionId: string | null = null;
  axonEvents: AxonEventView[] = [];
  authMethods: unknown[] | null = null;

  constructor(private ws: WsBroadcaster) {}

  async start(opts: StartOptions) {
    await this.shutdown();

    const apiKey = process.env.RUNLOOP_API_KEY;
    const baseUrl = process.env.RUNLOOP_BASE_URL;

    if (!apiKey) {
      throw new HttpError(500, "RUNLOOP_API_KEY not set in server .env");
    }

    const sdk = new RunloopSDK({
      bearerToken: apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });

    this.ws.broadcast({ type: "connection_progress", step: "Creating Axon channel..." });
    const axon = await sdk.axon.create({ name: "node-demo-acp" });

    const launchCommands = opts.launchCommands ? [...opts.launchCommands] : [];
    if (opts.systemPrompt) {
      const config = JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        agent: {
          build: {
            prompt: opts.systemPrompt,
          },
        },
      });
      launchCommands.unshift(
        `mkdir -p /home/user && cat > /home/user/opencode.json << 'OPENCODE_CFG_EOF'\n${config}\nOPENCODE_CFG_EOF`,
      );
    }

    this.ws.broadcast({ type: "connection_progress", step: "Provisioning sandbox..." });
    const devbox = await sdk.devbox.create({
      name: "acp-app",
      blueprint_name: "runloop/agents",
      mounts: [
        {
          type: "broker_mount" as const,
          axon_id: axon.id,
          protocol: "acp" as const,
          agent_binary: opts.agentBinary ?? "opencode",
          launch_args: opts.launchArgs,
        },
      ],
      launch_parameters: launchCommands.length
        ? { launch_commands: launchCommands, keep_alive_time_seconds: 300 }
        : undefined,
    });

    this.axonEvents = [];

    const client = new NodeACPClient();
    this.nodeClient = client;
    client.onEvent((event) => this.ws.broadcast(event));

    this.ws.broadcast({ type: "connection_progress", step: "Connecting to agent..." });
    const conn = new ACPAxonConnection(axon, devbox, {
      createClient: () => client,
      onDisconnect: async () => {
        await devbox.shutdown();
      },
    });

    conn.onAxonEvent((ev) => {
      this.axonEvents.push(ev);
    });

    conn.onTimelineEvent((event: ACPTimelineEvent) => {
      this.ws.broadcast({ type: "timeline_event", event });
    });

    this.connection = conn;

    const initResp = await conn.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "node-demo", version: "0.1.0" },
      clientCapabilities: CLIENT_CAPABILITIES,
    });

    this.authMethods = initResp.authMethods ?? null;

    this.ws.broadcast({ type: "connection_progress", step: "Starting session..." });
    const sessionResp = await conn.newSession({
      cwd: "/home/user",
      mcpServers: [],
    });
    this.activeSessionId = sessionResp.sessionId;

    return {
      sessionId: sessionResp.sessionId,
      devboxId: devbox.id,
      axonId: axon.id,
      runloopUrl: baseUrl ?? "https://app.runloop.ai",
      modes: sessionResp.modes,
      configOptions: sessionResp.configOptions,
      models: sessionResp.models,
      authMethods: this.authMethods,
      agentInfo: initResp.agentInfo ?? null,
      protocolVersion: initResp.protocolVersion ?? null,
      agentCapabilities: initResp.agentCapabilities ?? null,
      clientCapabilities: CLIENT_CAPABILITIES,
      sessionMeta: sessionResp._meta ?? null,
    };
  }

  requireConnection(): ACPAxonConnection {
    if (!this.connection) throw new HttpError(400, "Not connected");
    return this.connection;
  }

  requireSession(): { connection: ACPAxonConnection; sessionId: string } {
    const connection = this.requireConnection();
    if (!this.activeSessionId) throw new HttpError(400, "No active session");
    return { connection, sessionId: this.activeSessionId };
  }

  requireClient(): NodeACPClient {
    if (!this.nodeClient) throw new HttpError(400, "Not connected");
    return this.nodeClient;
  }

  async shutdown(): Promise<void> {
    await this.connection?.disconnect();
    this.nodeClient?.shutdown();

    this.connection = null;
    this.nodeClient = null;
    this.activeSessionId = null;
    this.axonEvents = [];
    this.authMethods = null;
  }
}
