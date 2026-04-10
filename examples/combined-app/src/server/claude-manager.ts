import { RunloopSDK } from "@runloop/api-client";
import type { Axon, Devbox } from "@runloop/api-client/sdk";
import { ClaudeAxonConnection, type AxonEventView } from "@runloop/agent-axon-client/claude";
import type { SDKControlResponse } from "@anthropic-ai/claude-agent-sdk";
import type { WsBroadcaster, WsEvent, BaseWsEvent } from "./ws.ts";

export interface ClaudeStartOptions {
  blueprintName?: string;
  launchCommands?: string[];
  systemPrompt?: string;
  model?: string;
  dangerouslySkipPermissions?: boolean;
}

export class ClaudeConnectionManager {
  connection: ClaudeAxonConnection | null = null;
  axonEvents: AxonEventView[] = [];

  private axon: Axon | null = null;
  private devbox: Devbox | null = null;
  private storedSystemPrompt?: string;
  private storedModel?: string;
  private storedDangerouslySkipPermissions?: boolean;
  private pendingControlResponses = new Map<
    string,
    { resolve: (data: unknown) => void; reject: (err: Error) => void }
  >();

  constructor(
    private ws: WsBroadcaster,
    private agentId: string,
  ) {}

  private tag(event: BaseWsEvent): WsEvent {
    return { ...event, agentId: this.agentId } as WsEvent;
  }

  async start(opts: ClaudeStartOptions) {

    const apiKey = process.env.RUNLOOP_API_KEY;
    const baseUrl = process.env.RUNLOOP_BASE_URL;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) throw new Error("RUNLOOP_API_KEY not set in server .env");

    const sdk = new RunloopSDK({
      bearerToken: apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });

    this.ws.broadcast(this.tag({ type: "connection_progress", step: "Creating Axon channel..." }));
    const axon = await sdk.axon.create({ name: "combined-app-claude" });
    this.axon = axon;

    this.ws.broadcast(this.tag({ type: "connection_progress", step: "Provisioning sandbox..." }));
    const devbox = await sdk.devbox.create({
      name: "combined-app-claude",
      blueprint_name: opts.blueprintName ?? "runloop/agents",
      mounts: [
        {
          type: "broker_mount" as const,
          axon_id: axon.id,
          protocol: "claude_json" as const,
          launch_args: opts.dangerouslySkipPermissions !== false ? ["--dangerously-skip-permissions"] : [],
        },
      ],
      environment_variables: {
        ...(anthropicApiKey ? { ANTHROPIC_API_KEY: anthropicApiKey } : {}),
      },
      launch_parameters: opts.launchCommands?.length
        ? { launch_commands: opts.launchCommands }
        : undefined,
    });

    this.devbox = devbox;

    this.storedSystemPrompt = opts.systemPrompt;
    this.storedModel = opts.model;
    this.storedDangerouslySkipPermissions = opts.dangerouslySkipPermissions;

    this.ws.broadcast(this.tag({ type: "connection_progress", step: "Connecting to Claude Code..." }));
    const conn = this.wireConnection(axon, devbox, {
      onDisconnect: async () => { await devbox.shutdown(); },
      systemPrompt: opts.systemPrompt,
      model: opts.model,
    });
    await conn.connect();
    await conn.initialize();

    return {
      devboxId: devbox.id,
      axonId: axon.id,
      runloopUrl: baseUrl ?? "https://platform.runloop.ai",
    };
  }

  private wireConnection(
    axon: Axon,
    devbox: Devbox,
    opts?: {
      onDisconnect?: () => Promise<void>;
      systemPrompt?: string;
      model?: string;
    },
  ): ClaudeAxonConnection {
    this.axonEvents = [];

    const conn = new ClaudeAxonConnection(axon, devbox, {
      verbose: true,
      ...(opts?.onDisconnect ? { onDisconnect: opts.onDisconnect } : {}),
      ...(opts?.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
      ...(opts?.model ? { model: opts.model } : {}),
    });

    this.connection = conn;

    conn.onAxonEvent((ev) => {
      this.axonEvents.push(ev);
    });

    conn.onTimelineEvent((ev) => {
      this.ws.broadcast(this.tag({ type: "timeline_event", event: ev }));
    });

    const skipPerms = this.storedDangerouslySkipPermissions !== false;

    // Intercept can_use_tool control requests.
    // With --dangerously-skip-permissions we auto-approve (shouldn't normally
    // hit this path for permissions, but AskUserQuestion still arrives here).
    // Without it, forward all requests to the frontend for user approval.
    conn.onControlRequest("can_use_tool", async (message) => {
      const requestId = message.request_id;
      const request = message.request;
      console.log(
        `[control] can_use_tool request: tool=${request.tool_name} id=${requestId} skipPerms=${skipPerms}`,
      );

      // AskUserQuestion always goes to the frontend
      // Without --dangerously-skip-permissions, all requests go to the frontend
      if (request.tool_name === "AskUserQuestion" || !skipPerms) {
        this.ws.broadcast(this.tag({ type: "control_request", controlRequest: message }));

        return new Promise<SDKControlResponse>((resolve, reject) => {
          this.pendingControlResponses.set(requestId, {
            resolve: (data: unknown) => {
              resolve({
                type: "control_response",
                response: {
                  subtype: "success",
                  request_id: requestId,
                  response: data as Record<string, unknown>,
                },
              });
            },
            reject,
          });
        });
      }

      // Auto-approve (only reachable with --dangerously-skip-permissions)
      return {
        type: "control_response",
        response: {
          subtype: "success",
          request_id: requestId,
          response: { behavior: "allow", updatedInput: request.input },
        },
      };
    });

    return conn;
  }

  async subscribe(): Promise<void> {
    if (!this.axon || !this.devbox) throw new Error("No axon/devbox — agent not started");
    if (this.connection) {
      this.connection.abortStream();
    }
    const conn = this.wireConnection(this.axon, this.devbox, {
      systemPrompt: this.storedSystemPrompt,
      model: this.storedModel,
    });
    await conn.connect();
  }

  resolveControlResponse(requestId: string, response: unknown): boolean {
    const pending = this.pendingControlResponses.get(requestId);
    if (!pending) return false;
    this.pendingControlResponses.delete(requestId);
    pending.resolve(response);
    return true;
  }

  async send(prompt: string | Record<string, unknown>): Promise<void> {
    if (!this.connection) throw new Error("Not connected");
    await this.connection.send(prompt as any);
  }

  async interrupt(): Promise<void> {
    if (!this.connection) throw new Error("Not connected");
    await this.connection.interrupt();
  }

  async setModel(model: string): Promise<void> {
    if (!this.connection) throw new Error("Not connected");
    await this.connection.setModel(model);
  }

  async setPermissionMode(mode: string): Promise<void> {
    if (!this.connection) throw new Error("Not connected");
    await this.connection.setPermissionMode(mode as Parameters<typeof this.connection.setPermissionMode>[0]);
  }

  async shutdown(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect();
    }
    this.connection = null;
    this.axon = null;
    this.devbox = null;
    this.axonEvents = [];
    this.storedSystemPrompt = undefined;
    this.storedModel = undefined;
    this.storedDangerouslySkipPermissions = undefined;
    for (const [, pending] of this.pendingControlResponses) {
      pending.reject(new Error("Shutdown"));
    }
    this.pendingControlResponses.clear();
  }
}
