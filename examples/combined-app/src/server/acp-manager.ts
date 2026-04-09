import { RunloopSDK } from "@runloop/api-client";
import type { Axon } from "@runloop/api-client/sdk";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  type Agent,
} from "@runloop/agent-axon-client/acp";
import { axonStream, classifyACPAxonEvent, tryParseSystemEvent, type AxonEventView } from "@runloop/agent-axon-client/acp";
import { NodeACPClient } from "./acp-client.ts";
import type { WsBroadcaster, WsEvent, BaseWsEvent } from "./ws.ts";

export interface ACPStartOptions {
  agentBinary?: string;
  launchArgs?: string[];
  launchCommands?: string[];
  systemPrompt?: string;
  autoApprovePermissions?: boolean;
}

const CLIENT_CAPABILITIES = {
  fs: { readTextFile: true, writeTextFile: true },
  terminal: true,
  elicitation: { form: {} },
} as const;

export class ACPConnectionManager {
  connection: ClientSideConnection | null = null;
  nodeClient: NodeACPClient | null = null;
  activeSessionId: string | null = null;
  axonEvents: AxonEventView[] = [];
  authMethods: unknown[] | null = null;

  private axon: Axon | null = null;
  private devboxShutdown: (() => Promise<void>) | null = null;
  private abortController: AbortController | null = null;

  constructor(
    private ws: WsBroadcaster,
    private agentId: string,
  ) {}

  private tag(event: BaseWsEvent): WsEvent {
    return { ...event, agentId: this.agentId } as WsEvent;
  }

  async start(opts: ACPStartOptions) {
    const apiKey = process.env.RUNLOOP_API_KEY;
    const baseUrl = process.env.RUNLOOP_BASE_URL;

    if (!apiKey) throw new Error("RUNLOOP_API_KEY not set in server .env");

    const sdk = new RunloopSDK({
      bearerToken: apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });

    this.ws.broadcast(this.tag({ type: "connection_progress", step: "Creating Axon channel..." }));
    const axon = await sdk.axon.create({ name: "combined-app-acp" });
    this.axon = axon;

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

    this.ws.broadcast(this.tag({ type: "connection_progress", step: "Provisioning sandbox..." }));
    const devbox = await sdk.devbox.create({
      name: "combined-app-acp",
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

    this.devboxShutdown = async () => {
      await devbox.shutdown();
    };

    this.ws.broadcast(this.tag({ type: "connection_progress", step: "Connecting to agent..." }));
    const conn = this.wireStream(axon, opts.autoApprovePermissions !== false);

    const initResp = await conn.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "combined-app", version: "0.1.0" },
      clientCapabilities: CLIENT_CAPABILITIES,
    });

    this.authMethods = initResp.authMethods ?? null;

    this.ws.broadcast(this.tag({ type: "connection_progress", step: "Starting session..." }));
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

  private wireStream(axon: Axon, autoApprovePermissions: boolean): ClientSideConnection {
    this.abortController = new AbortController();
    this.axonEvents = [];

    const stream = axonStream({
      axon,
      signal: this.abortController.signal,
      onAxonEvent: (ev) => {
        this.axonEvents.push(ev);
        this.ws.broadcast(this.tag({ type: "axon_event", event: ev }));
        this.ws.broadcast(this.tag({ type: "timeline_event", event: classifyACPAxonEvent(ev) }));

        const systemEvent = tryParseSystemEvent(ev);
        if (systemEvent) {
          if (systemEvent.type === "turn.started") {
            this.ws.broadcast(this.tag({
              type: "turn_started",
              turnId: systemEvent.turnId,
            }));
          } else if (systemEvent.type === "turn.completed") {
            this.ws.broadcast(this.tag({
              type: "turn_completed",
              turnId: systemEvent.turnId,
              stopReason: systemEvent.stopReason ?? "EndTurn",
            }));
          }
        }
      },
    });

    const client = new NodeACPClient();
    client.autoApprovePermissions = autoApprovePermissions;
    this.nodeClient = client;
    client.onEvent((event) => this.ws.broadcast(this.tag(event)));

    const conn = new ClientSideConnection(
      (_agent: Agent) => client,
      stream,
    );
    this.connection = conn;
    return conn;
  }

  subscribe(): void {
    if (!this.axon) throw new Error("No axon — agent not started");
    const autoApprove = this.nodeClient?.autoApprovePermissions ?? true;
    this.abortController?.abort();
    this.nodeClient?.shutdown();
    this.wireStream(this.axon, autoApprove);
  }

  requireConnection(): ClientSideConnection {
    if (!this.connection) throw new Error("Not connected");
    return this.connection;
  }

  requireSession(): { connection: ClientSideConnection; sessionId: string } {
    const connection = this.requireConnection();
    if (!this.activeSessionId) throw new Error("No active session");
    return { connection, sessionId: this.activeSessionId };
  }

  requireClient(): NodeACPClient {
    if (!this.nodeClient) throw new Error("Not connected");
    return this.nodeClient;
  }

  async shutdown(): Promise<void> {
    this.abortController?.abort();
    this.nodeClient?.shutdown();
    if (this.devboxShutdown) await this.devboxShutdown();

    this.connection = null;
    this.nodeClient = null;
    this.activeSessionId = null;
    this.devboxShutdown = null;
    this.abortController = null;
    this.axon = null;
    this.axonEvents = [];
    this.authMethods = null;
  }
}
