import { RunloopSDK } from "@runloop/api-client";
import { ClaudeAxonConnection, type AxonEventView } from "@runloop/agent-axon-client/claude";
import { setupAnthropicGateway } from "@runloop/examples-shared";
import type { SDKControlResponse, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { WsBroadcaster, WsEvent } from "./ws.ts";

export interface ClaudeStartOptions {
  blueprintName?: string;
  launchCommands?: string[];
  systemPrompt?: string;
  model?: string;
  autoApprovePermissions?: boolean;
}

export class ClaudeConnectionManager {
  connection: ClaudeAxonConnection | null = null;
  axonEvents: AxonEventView[] = [];
  autoApprovePermissions = true;

  private abortController: AbortController | null = null;
  private gatewayCleanup: (() => Promise<void>) | null = null;
  private pendingControlResponses = new Map<
    string,
    { resolve: (data: unknown) => void; reject: (err: Error) => void }
  >();

  constructor(private ws: WsBroadcaster) {}

  async start(opts: ClaudeStartOptions) {
    this.autoApprovePermissions = opts.autoApprovePermissions !== false;

    const apiKey = process.env.RUNLOOP_API_KEY;
    const baseUrl = process.env.RUNLOOP_BASE_URL;

    if (!apiKey) throw new Error("RUNLOOP_API_KEY not set in server .env");

    const sdk = new RunloopSDK({
      bearerToken: apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });

    this.ws.broadcast({ type: "connection_progress", step: "Setting up Agent Gateway to protect your credentials..." });
    const gateway = await setupAnthropicGateway(sdk, { optional: true });
    this.gatewayCleanup = gateway?.cleanup ?? null;

    this.ws.broadcast({ type: "connection_progress", step: "Creating Axon channel..." });
    const axon = await sdk.axon.create({ name: "combined-app-claude" });

    this.ws.broadcast({ type: "connection_progress", step: "Provisioning sandbox..." });
    const devbox = await sdk.devbox.create({
      name: "combined-app-claude",
      blueprint_name: opts.blueprintName ?? "runloop/agents",
      mounts: [
        {
          type: "broker_mount" as const,
          axon_id: axon.id,
          protocol: "claude_json" as const,
          launch_args: [],
        },
      ],
      ...(gateway ? { gateways: gateway.gateways } : {}),
      launch_parameters: opts.launchCommands?.length
        ? { launch_commands: opts.launchCommands }
        : undefined,
    });

    this.abortController = new AbortController();
    this.axonEvents = [];

    const conn = new ClaudeAxonConnection(axon, devbox, {
      onDisconnect: async () => {
        await devbox.shutdown();
      },
      verbose: true,
      ...(opts.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
      ...(opts.model ? { model: opts.model } : {}),
    });

    this.connection = conn;

    conn.onAxonEvent((ev) => {
      this.axonEvents.push(ev);
      this.ws.broadcast({ type: "axon_event", event: ev });
    });

    conn.onControlRequest("can_use_tool", async (message) => {
      const requestId = message.request_id;
      const request = message.request;
      console.log(
        `[control] can_use_tool request: tool=${request.tool_name} id=${requestId} autoApprove=${this.autoApprovePermissions}`,
      );

      if (this.autoApprovePermissions) {
        return {
          type: "control_response",
          response: {
            subtype: "success",
            request_id: requestId,
            response: { behavior: "allow", updatedInput: request.input },
          },
        };
      }

      this.ws.broadcast({ type: "control_request", controlRequest: message as unknown as Record<string, unknown> });

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
    });

    this.ws.broadcast({ type: "connection_progress", step: "Connecting to Claude Code..." });
    await conn.initialize();

    this.runReadLoop(conn);

    return {
      devboxId: devbox.id,
      axonId: axon.id,
      runloopUrl: baseUrl ?? "https://platform.runloop.ai",
    };
  }

  private async runReadLoop(conn: ClaudeAxonConnection): Promise<void> {
    console.log("[read-loop] started");
    try {
      for await (const msg of conn.receiveMessages()) {
        const msgType = (msg as Record<string, unknown>).type;
        const msgSubtype = (msg as Record<string, unknown>).subtype;
        console.log(`[read-loop] received: type=${msgType} subtype=${msgSubtype}`);

        this.ws.broadcast({ type: "sdk_message", message: msg as unknown as Record<string, unknown> });

        if (msg.type === "result") {
          this.ws.broadcast({ type: "turn_complete", result: msg } as WsEvent);
        }
      }
      console.log("[read-loop] ended (generator returned)");
    } catch (err) {
      console.error("[read-loop] error:", err);
      this.ws.broadcast({
        type: "turn_error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
    this.abortController?.abort();
    if (this.connection) {
      await this.connection.disconnect();
    }
    if (this.gatewayCleanup) {
      await this.gatewayCleanup();
    }
    this.connection = null;
    this.abortController = null;
    this.axonEvents = [];
    this.autoApprovePermissions = true;
    this.gatewayCleanup = null;
    for (const [, pending] of this.pendingControlResponses) {
      pending.reject(new Error("Shutdown"));
    }
    this.pendingControlResponses.clear();
  }
}
