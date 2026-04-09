import { RunloopSDK } from "@runloop/api-client";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  type Agent,
} from "@runloop/agent-axon-client/acp";
import { axonStream, type AxonEventView } from "@runloop/agent-axon-client/acp";
import { NodeACPClient } from "./acp-client.ts";
import { BadRequestError } from "./http-errors.ts";
import type { WsBroadcaster } from "./ws.ts";

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

  private devboxShutdown: (() => Promise<void>) | null = null;
  private abortController: AbortController | null = null;

  constructor(private ws: WsBroadcaster) {}

  async start(opts: ACPStartOptions) {
    const apiKey = process.env.RUNLOOP_API_KEY;
    const baseUrl = process.env.RUNLOOP_BASE_URL;

    if (!apiKey) throw new Error("RUNLOOP_API_KEY not set in server .env");

    const sdk = new RunloopSDK({
      bearerToken: apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });

    this.ws.broadcast({
      type: "connection_progress",
      step: "Creating Axon channel...",
    });
    const axon = await sdk.axon.create({ name: "combined-app-acp" });

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

    this.ws.broadcast({
      type: "connection_progress",
      step: "Provisioning sandbox...",
    });
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
    this.abortController = new AbortController();
    this.axonEvents = [];

    this.ws.broadcast({
      type: "connection_progress",
      step: "Connecting to agent...",
    });
    const stream = axonStream({
      axon,
      signal: this.abortController.signal,
      onAxonEvent: (ev) => {
        this.axonEvents.push(ev);
        this.ws.broadcast({ type: "axon_event", event: ev });

        if (ev.origin === "SYSTEM_EVENT") {
          try {
            const payload = JSON.parse(ev.payload);
            if (ev.event_type === "turn.started") {
              this.ws.broadcast({
                type: "turn_started",
                turnId: payload.turn_id,
              });
            } else if (ev.event_type === "turn.completed") {
              this.ws.broadcast({
                type: "turn_completed",
                turnId: payload.turn_id,
                stopReason: payload.stop_reason ?? "EndTurn",
              });
            }
          } catch {
            /* ignore parse errors */
          }
        }
      },
    });

    const client = new NodeACPClient();
    client.autoApprovePermissions = opts.autoApprovePermissions !== false;
    this.nodeClient = client;
    client.onEvent((event) => this.ws.broadcast(event));

    this.connection = new ClientSideConnection(
      (_agent: Agent) => client,
      stream,
    );

    let initResp;
    try {
      initResp = await this.connection!.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "combined-app", version: "0.1.0" },
        clientCapabilities: CLIENT_CAPABILITIES,
      });
    } catch (err: any) {
      // shut down but don't wait for it to complete
      this.shutdown().catch(() => {});
      throw new BadRequestError(`Failed to initialize agent: ${err?.message}`, {
        cause: err,
      });
    }

    const initData = initResp as Record<string, unknown>;
    this.authMethods = (initData.authMethods as unknown[]) ?? null;

    this.ws.broadcast({
      type: "connection_progress",
      step: "Starting session...",
    });
    let sessionResp;
    try {
      sessionResp = await this.connection!.newSession({
        cwd: "/home/user",
        mcpServers: [],
      });
    } catch (err) {
      await this.shutdown();
      throw new Error(`Failed to create session: ${this.extractMessage(err)}`);
    }
    this.activeSessionId = sessionResp.sessionId;

    const sessionRaw = sessionResp as Record<string, unknown>;

    return {
      sessionId: sessionResp.sessionId,
      devboxId: devbox.id,
      axonId: axon.id,
      runloopUrl: baseUrl ?? "https://app.runloop.ai",
      modes: sessionRaw.modes,
      configOptions: sessionRaw.configOptions,
      models: sessionRaw.models,
      authMethods: this.authMethods,
      agentInfo:
        (initData.agentInfo as
          | { name?: string; title?: string | null; version?: string }
          | undefined) ?? null,
      protocolVersion: initData.protocolVersion ?? null,
      agentCapabilities: initData.agentCapabilities ?? null,
      clientCapabilities: CLIENT_CAPABILITIES,
      sessionMeta: sessionRaw._meta ?? null,
    };
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

  private extractMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "object" && err !== null && "message" in err)
      return String((err as { message: unknown }).message);
    return String(err);
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
    this.axonEvents = [];
    this.authMethods = null;
  }
}
