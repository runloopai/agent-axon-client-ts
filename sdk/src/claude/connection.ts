/**
 * ClaudeAxonConnection — bidirectional, interactive client for Claude Code via Axon.
 *
 * Provides:
 * - connect() / disconnect() lifecycle
 * - send() to send user messages
 * - receiveMessages() / receiveResponse() async iterators
 * - Control protocol: interrupt, setPermissionMode, setModel
 *
 * Messages are yielded as `SDKMessage` from `@anthropic-ai/claude-agent-sdk` —
 * the exact types the Claude Code CLI emits. No parsing/translation layer needed.
 *
 * Communication happens over a Runloop Axon channel: outbound messages are
 * published via axon.publish(), inbound messages arrive via axon.subscribeSse().
 */

import type {
  PermissionMode,
  SDKControlRequest,
  SDKControlResponse,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Axon, Devbox } from "@runloop/api-client/sdk";
import { AxonTransport, type Transport } from "./transport.js";
import type { WireData } from "./types.js";

/** The inner request payload — discriminated by `subtype`. */
type ControlRequestInner = SDKControlRequest["request"];

/** Extract a specific control request subtype. */
type ControlRequestOfSubtype<S extends ControlRequestInner["subtype"]> = Extract<
  ControlRequestInner,
  { subtype: S }
>;

// ---------------------------------------------------------------------------
// Control protocol helpers
// ---------------------------------------------------------------------------

function nextRequestId(counter: number): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `req_${counter}_${rand}`;
}

interface PendingControlRequest {
  resolve: (value: WireData) => void;
  reject: (reason: Error) => void;
}

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

export interface ClaudeAxonConnectionOptions {
  /** If true, emit verbose logs to stderr. */
  verbose?: boolean;
  /** Override the system prompt for this session. */
  systemPrompt?: string;
  /** Append to the default system prompt for this session. */
  appendSystemPrompt?: string;
  /** Model ID (e.g. 'claude-haiku-4-5', 'claude-sonnet-4-5'). Set after initialization. */
  model?: string;
}

// ---------------------------------------------------------------------------
// ClaudeAxonConnection
// ---------------------------------------------------------------------------

export class ClaudeAxonConnection {
  private transport: Transport;
  private devbox?: Devbox;
  private options: ClaudeAxonConnectionOptions;

  // Message routing
  private messageQueue: SDKMessage[] = [];
  private messageWaiters: Array<(msg: SDKMessage | null) => void> = [];
  private readLoopRunning = false;
  private readLoopDone = false;

  // Control protocol
  private requestCounter = 0;
  private pendingControlRequests = new Map<string, PendingControlRequest>();
  private closed = false;

  /**
   * @param axon    The Axon channel to communicate over. Axon should be mounted to a
   *                devbox with the "claude_json" protocol.
   * @param devbox  Optional Devbox instance. If provided, it will be shut down
   *                automatically when {@link disconnect} is called.
   * @param options Connection options (verbose logging, system prompt, model, etc.).
   */
  constructor(axon: Axon, devbox?: Devbox, options?: ClaudeAxonConnectionOptions) {
    this.options = options ?? {};
    this.devbox = devbox;
    this.transport = new AxonTransport(axon, {
      verbose: this.options.verbose,
    });
  }

  private log(tag: string, ...args: unknown[]): void {
    if (!this.options.verbose) return;
    const ts = new Date().toISOString().slice(11, 23);
    console.error(`[${ts}] [claude-sdk:${tag}]`, ...args);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Connect to the remote Claude Code instance.
   */
  async connect(): Promise<void> {
    if (this.closed) {
      throw new Error(
        "This ClaudeAxonConnection has already been disconnected and cannot be reused. Create a new instance.",
      );
    }
    await this.transport.connect();
    this.startReadLoop();

    // Initialize the control protocol
    await this.initialize();

    // Set model if provided
    if (this.options.model) {
      await this.setModel(this.options.model);
    }
  }

  /** Disconnect from Claude Code. */
  async disconnect(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // Unblock any waiters
    for (const waiter of this.messageWaiters) {
      waiter(null);
    }
    this.messageWaiters.length = 0;

    // Fail pending control requests
    for (const [, pending] of this.pendingControlRequests) {
      pending.reject(new Error("Client disconnected"));
    }
    this.pendingControlRequests.clear();

    await this.transport.close();

    // Shut down devbox if one was provided
    if (this.devbox) {
      try {
        await this.devbox.shutdown();
        this.log("disconnect", "devbox shut down");
      } catch (err) {
        this.log("disconnect", `devbox shutdown error: ${err}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Read loop — routes control messages vs SDK messages
  // -----------------------------------------------------------------------

  private startReadLoop(): void {
    if (this.readLoopRunning) return;
    this.readLoopRunning = true;

    (async () => {
      try {
        for await (const message of this.transport.readMessages()) {
          if (this.closed) break;
          this.routeMessage(message);
        }
      } catch (err) {
        this.log("readLoop", `error: ${err}`);
        // Fail all pending control requests
        for (const [, pending] of this.pendingControlRequests) {
          pending.reject(err instanceof Error ? err : new Error(String(err)));
        }
        this.pendingControlRequests.clear();
      } finally {
        this.readLoopDone = true;
        // Signal end to any message waiters
        for (const waiter of this.messageWaiters) {
          waiter(null);
        }
        this.messageWaiters.length = 0;
      }
    })();
  }

  private routeMessage(message: WireData): void {
    const msgType = message.type;

    // Control response — resolve pending request
    if (msgType === "control_response") {
      const response = message.response ?? {};
      const requestId: string | undefined = response.request_id;
      if (requestId && this.pendingControlRequests.has(requestId)) {
        // biome-ignore lint/style/noNonNullAssertion: guarded by .has() check above
        const pending = this.pendingControlRequests.get(requestId)!;
        this.pendingControlRequests.delete(requestId);
        if (response.subtype === "error") {
          pending.reject(new Error(response.error ?? "Unknown control error"));
        } else {
          pending.resolve(response.response ?? {});
        }
      }
      return;
    }

    // Control request from CLI — handle incoming control requests
    if (msgType === "control_request") {
      this.handleIncomingControlRequest(message as SDKControlRequest).catch((err) => {
        this.log("control", `handler error: ${err}`);
      });
      return;
    }

    // Control cancel request
    if (msgType === "control_cancel_request") {
      return;
    }

    // Regular SDK message — cast and deliver
    const sdkMessage = message as SDKMessage;
    if (this.messageWaiters.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: guarded by .length > 0 check above
      const waiter = this.messageWaiters.shift()!;
      waiter(sdkMessage);
    } else {
      this.messageQueue.push(sdkMessage);
    }
  }

  /** Wait for the next SDK message (non-control). */
  private nextMessage(): Promise<SDKMessage | null> {
    if (this.messageQueue.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: guarded by .length > 0 check above
      return Promise.resolve(this.messageQueue.shift()!);
    }
    if (this.readLoopDone || this.closed) {
      return Promise.resolve(null);
    }
    return new Promise<SDKMessage | null>((resolve) => {
      this.messageWaiters.push(resolve);
    });
  }

  // -----------------------------------------------------------------------
  // Control protocol
  // -----------------------------------------------------------------------

  private async sendControlRequest(request: WireData, timeoutMs = 60_000): Promise<WireData> {
    this.requestCounter++;
    const requestId = nextRequestId(this.requestCounter);
    const controlRequest = {
      type: "control_request",
      request_id: requestId,
      request,
    };

    const promise = new Promise<WireData>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingControlRequests.has(requestId)) {
          this.pendingControlRequests.delete(requestId);
          reject(new Error(`Control request timeout: ${request.subtype}`));
        }
      }, timeoutMs);

      this.pendingControlRequests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timer);
          reject(reason);
        },
      });
    });

    await this.transport.write(JSON.stringify(controlRequest));
    return promise;
  }

  private async initialize(): Promise<WireData> {
    this.log("init", "sending initialize request");
    const response = await this.sendControlRequest(
      {
        subtype: "initialize",
        hooks: null,
        ...(this.options.systemPrompt && { systemPrompt: this.options.systemPrompt }),
        ...(this.options.appendSystemPrompt && {
          appendSystemPrompt: this.options.appendSystemPrompt,
        }),
      },
      120_000, // longer timeout for initialization
    );
    this.log("init", "initialized");
    return response;
  }

  /** Handle an incoming control request from the CLI (e.g. permission, hook). */
  private async handleIncomingControlRequest(message: SDKControlRequest): Promise<void> {
    const requestId = message.request_id;
    const request = message.request;

    try {
      let responseData: WireData = {};

      switch (request.subtype) {
        case "can_use_tool": {
          const permReq: ControlRequestOfSubtype<"can_use_tool"> = request;
          // Default: allow all tools (users can override via options)
          responseData = {
            behavior: "allow",
            updatedInput: permReq.input,
          };
          break;
        }
        case "hook_callback": {
          // Default: continue without modification
          responseData = { continue: true };
          break;
        }
        case "mcp_message": {
          responseData = { error: "SDK MCP servers not supported in AxonTransport" };
          break;
        }
        default:
          responseData = {};
          break;
      }

      const successResponse: SDKControlResponse = {
        type: "control_response",
        response: {
          subtype: "success",
          request_id: requestId,
          response: responseData,
        },
      };
      await this.transport.write(JSON.stringify(successResponse));
    } catch (err) {
      const errorResponse: SDKControlResponse = {
        type: "control_response",
        response: {
          subtype: "error",
          request_id: requestId,
          error: String(err),
        },
      };
      await this.transport.write(JSON.stringify(errorResponse));
    }
  }

  // -----------------------------------------------------------------------
  // Public API — sending messages
  // -----------------------------------------------------------------------

  /**
   * Send a single user message to Claude.
   * Convenience: if given a string, it is wrapped into an SDKUserMessage.
   */
  async send(prompt: string | SDKUserMessage): Promise<void> {
    const message: SDKUserMessage =
      typeof prompt === "string"
        ? {
            type: "user",
            message: { role: "user", content: prompt },
            parent_tool_use_id: null,
          }
        : prompt;
    await this.transport.write(JSON.stringify(message));
  }

  // -----------------------------------------------------------------------
  // Public API — receiving messages
  // -----------------------------------------------------------------------

  /**
   * Async iterator that yields all SDKMessages from Claude indefinitely.
   * Does not stop at result — use receiveResponse() for that.
   */
  async *receiveMessages(): AsyncGenerator<SDKMessage, void, undefined> {
    while (true) {
      const msg = await this.nextMessage();
      if (msg === null) return;
      yield msg;
    }
  }

  /**
   * Async iterator that yields SDKMessages until (and including) a result message.
   * Automatically terminates after the result — convenient for single-turn usage.
   */
  async *receiveResponse(): AsyncGenerator<SDKMessage, void, undefined> {
    for await (const msg of this.receiveMessages()) {
      yield msg;
      if (msg.type === "result") {
        return;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public API — control operations
  // -----------------------------------------------------------------------

  /** Interrupt the current conversation turn. */
  async interrupt(): Promise<void> {
    await this.sendControlRequest({ subtype: "interrupt" });
  }

  /** Change the permission mode. */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    await this.sendControlRequest({
      subtype: "set_permission_mode",
      mode,
    });
  }

  /** Change the AI model. */
  async setModel(model: string | null): Promise<void> {
    await this.sendControlRequest({
      subtype: "set_model",
      model,
    });
  }

  // /** Stop a running background task. */
  // async stopTask(taskId: string): Promise<void> {
  //   await this.sendControlRequest({
  //     subtype: "stop_task",
  //     task_id: taskId,
  //   });
  // }

  // /** Get MCP server connection status. */
  // async getMcpStatus(): Promise<WireData> {
  //   return this.sendControlRequest({ subtype: "mcp_status" });
  // }

  // /** Get context window usage breakdown. */
  // async getContextUsage(): Promise<SDKControlGetContextUsageResponse> {
  //   return this.sendControlRequest({
  //     subtype: "get_context_usage",
  //   }) as Promise<SDKControlGetContextUsageResponse>;
  // }

  // /** Reconnect a disconnected MCP server. */
  // async reconnectMcpServer(serverName: string): Promise<void> {
  //   await this.sendControlRequest({
  //     subtype: "mcp_reconnect",
  //     serverName,
  //   });
  // }

  // /** Toggle an MCP server on/off. */
  // async toggleMcpServer(serverName: string, enabled: boolean): Promise<void> {
  //   await this.sendControlRequest({
  //     subtype: "mcp_toggle",
  //     serverName,
  //     enabled,
  //   });
  // }

  // /** Rewind tracked files to a specific user message checkpoint. */
  // async rewindFiles(userMessageId: string): Promise<void> {
  //   await this.sendControlRequest({
  //     subtype: "rewind_files",
  //     user_message_id: userMessageId,
  //   });
  // }
}
