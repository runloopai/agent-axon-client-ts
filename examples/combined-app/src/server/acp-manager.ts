import { RunloopSDK } from "@runloop/api-client";
import type { Axon, Devbox } from "@runloop/api-client/sdk";
import {
  ACPAxonConnection,
  PROTOCOL_VERSION,
  type ACPTimelineEvent,
  type AxonEventView,
} from "@runloop/agent-axon-client/acp";
import { NodeACPClient } from "./acp-client.ts";
import { HttpError } from "./http-errors.ts";
import type { WsBroadcaster, WsEvent, BaseWsEvent } from "./ws.ts";

export interface ACPStartOptions {
  agentBinary?: string;
  launchArgs?: string[];
  launchCommands?: string[];
  workingDir?: string;
  systemPrompt?: string;
  autoApprovePermissions?: boolean;
}

const CLIENT_CAPABILITIES = {
  elicitation: { form: {} },
} as const;

export class ACPConnectionManager {
  connection: ACPAxonConnection | null = null;
  nodeClient: NodeACPClient | null = null;
  activeSessionId: string | null = null;
  axonEvents: AxonEventView[] = [];
  authMethods: unknown[] | null = null;

  private axon: Axon | null = null;
  private devbox: Devbox | null = null;
  private workingDir: string = "/home/user";

  constructor(
    private ws: WsBroadcaster,
    private agentId: string,
  ) {}

  getWorkingDir(): string {
    return this.workingDir;
  }

  private tag(event: BaseWsEvent): WsEvent {
    return { ...event, agentId: this.agentId } as WsEvent;
  }

  async start(opts: ACPStartOptions) {
    const apiKey = process.env.RUNLOOP_API_KEY;
    const baseUrl = process.env.RUNLOOP_BASE_URL;

    if (!apiKey)
      throw new HttpError(401, "RUNLOOP_API_KEY not set in server .env");

    const sdk = new RunloopSDK({
      bearerToken: apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });

    this.ws.broadcast(
      this.tag({
        type: "connection_progress",
        step: "Creating Axon channel...",
      }),
    );
    const axon = await sdk.axon.create({ name: "combined-app-acp" });
    this.axon = axon;

    if (opts.workingDir) this.workingDir = opts.workingDir;
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

    this.ws.broadcast(
      this.tag({
        type: "connection_progress",
        step: "Provisioning sandbox...",
      }),
    );
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
          ...(opts.workingDir ? { working_directory: opts.workingDir } : {}),
        },
      ],

      launch_parameters: {
        ...(opts.launchCommands?.length
          ? { launch_commands: opts.launchCommands }
          : {}),
        lifecycle: {
          after_idle: {
            idle_time_seconds: 60,
            on_idle: "suspend",
          },
          resume_triggers: {
            axon_event: true,
          },
        },
      },
    });
    this.devbox = devbox;

    this.ws.broadcast(
      this.tag({ type: "connection_progress", step: "Connecting to agent..." }),
    );
    const conn = this.wireConnection(
      axon,
      devbox,
      opts.autoApprovePermissions !== false,
    );

    await conn.connect();
    let initResp;
    try {
      initResp = await conn.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "combined-app", version: "0.1.0" },
        clientCapabilities: CLIENT_CAPABILITIES,
      });
    } catch (err) {
      this.shutdown().catch(() => {});
      throw err;
    }

    this.authMethods = initResp.authMethods ?? null;

    this.ws.broadcast(
      this.tag({ type: "connection_progress", step: "Starting session..." }),
    );
    let sessionResp;
    try {
      sessionResp = await conn.newSession({
        cwd: this.workingDir,
        mcpServers: [],
      });
    } catch (err) {
      await this.shutdown();
      throw err;
    }
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

  private wireConnection(
    axon: Axon,
    devbox: Devbox,
    autoApprovePermissions: boolean,
  ): ACPAxonConnection {
    this.axonEvents = [];

    const client = new NodeACPClient();
    client.autoApprovePermissions = autoApprovePermissions;
    this.nodeClient = client;
    client.onEvent((event) => this.ws.broadcast(this.tag(event)));

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
      this.ws.broadcast(this.tag({ type: "timeline_event", event }));
    });

    this.connection = conn;
    return conn;
  }

  async subscribe(): Promise<void> {
    if (!this.axon || !this.devbox)
      throw new Error("No axon — agent not started");
    const autoApprove = this.nodeClient?.autoApprovePermissions ?? true;
    this.connection?.abortStream();
    this.nodeClient?.shutdown();
    const conn = this.wireConnection(this.axon, this.devbox, autoApprove);
    await conn.connect();
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
    this.axon = null;
    this.devbox = null;
    this.axonEvents = [];
    this.authMethods = null;
  }
}
