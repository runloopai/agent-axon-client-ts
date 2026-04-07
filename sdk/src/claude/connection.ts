/**
 * ClaudeAxonConnection — bidirectional, interactive client for Claude Code via Axon.
 *
 * Provides:
 * - initialize() / disconnect() lifecycle
 * - send() to send user messages
 * - receiveMessages() / receiveResponse() async iterators
 * - Control protocol: interrupt, setPermissionMode, setModel
 * - onControlRequest() to intercept incoming control requests (e.g. tool permissions)
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
import { runDisconnectHook } from "../shared/lifecycle.js";
import { ListenerSet } from "../shared/listener-set.js";
import { makeDefaultOnError, makeLogger } from "../shared/logging.js";
import type { AxonEventListener, BaseConnectionOptions } from "../shared/types.js";
import { AxonTransport, type Transport } from "./transport.js";
import type { WireData } from "./types.js";

/** The inner request payload — discriminated by `subtype`. */
export type ControlRequestInner = SDKControlRequest["request"];

/** Extract a specific control request subtype. */
export type ControlRequestOfSubtype<S extends ControlRequestInner["subtype"]> = Extract<
  ControlRequestInner,
  { subtype: S }
>;

/**
 * Handler for an incoming control request from the CLI.
 *
 * When Claude Code needs permission to use a tool (subtype "can_use_tool"),
 * it sends a control request. By registering a handler via
 * {@link ClaudeAxonConnection.onControlRequest}, you can intercept these
 * requests and provide a custom response — for example, showing a UI prompt
 * to the user and returning their selection.
 *
 * The handler receives the full {@link SDKControlRequest} and must return
 * a complete {@link SDKControlResponse}. If no handler is registered for a
 * given subtype, the built-in default behavior is used (e.g. auto-allow
 * for can_use_tool).
 *
 * @example
 * ```ts
 * connection.onControlRequest("can_use_tool", async (request) => {
 *   return {
 *     type: "control_response",
 *     response: {
 *       subtype: "success",
 *       request_id: request.request_id,
 *       response: { behavior: "allow", updatedInput: request.request.input },
 *     },
 *   };
 * });
 * ```
 *
 * @param request - The full control request message, narrowed so that
 *   `request.request` is typed to the specific subtype `S`.
 * @returns A complete {@link SDKControlResponse} to send back to the CLI.
 *
 * @category Configuration
 */
export type ControlRequestHandler<S extends ControlRequestInner["subtype"]> = (
  request: SDKControlRequest & { request: ControlRequestOfSubtype<S> },
) => Promise<SDKControlResponse>;

// ---------------------------------------------------------------------------
// Control protocol helpers
// ---------------------------------------------------------------------------

/**
 * Generates a unique request ID for an outbound control request.
 * Combines a monotonic counter with a random suffix to avoid collisions.
 *
 * @param counter - The current monotonically increasing counter value.
 * @returns A string of the form `req_{counter}_{random}`.
 */
function nextRequestId(counter: number): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `req_${counter}_${rand}`;
}

/**
 * Tracks a single in-flight control request so its promise can be
 * resolved or rejected when the matching response arrives.
 */
interface PendingControlRequest {
  /** Settles the promise with the response payload on success. */
  resolve: (value: WireData) => void;
  /** Rejects the promise on error or timeout. */
  reject: (reason: Error) => void;
}

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

/** @category Configuration */
export interface ClaudeAxonConnectionOptions extends BaseConnectionOptions {
  /**
   * Replaces the default system prompt sent to Claude Code during the
   * `initialize` control handshake. When set, the agent uses *only* this
   * text as its system prompt — the built-in prompt is discarded entirely.
   *
   * Mutually independent of {@link appendSystemPrompt}; if both are
   * provided, `systemPrompt` replaces the default and
   * `appendSystemPrompt` is appended to that replacement.
   */
  systemPrompt?: string;

  /**
   * Text appended to the system prompt (whether default or overridden by
   * {@link systemPrompt}) during the `initialize` handshake. Use this to
   * inject additional instructions without losing the agent's built-in
   * prompt.
   */
  appendSystemPrompt?: string;

  /**
   * Anthropic model identifier to select after initialization
   * (e.g. `"claude-haiku-4-5"`, `"claude-sonnet-4-5"`).
   *
   * When provided, {@link ClaudeAxonConnection.initialize | initialize()} sends
   * a `set_model` control request immediately after the `initialize`
   * handshake completes.
   */
  model?: string;
}

// ---------------------------------------------------------------------------
// ClaudeAxonConnection
// ---------------------------------------------------------------------------

/**
 * Bidirectional, interactive client for Claude Code via Axon.
 *
 * Provides:
 * - {@link initialize} / {@link disconnect} lifecycle
 * - {@link send} to send user messages
 * - {@link receiveMessages} / {@link receiveResponse} async iterators
 * - Control protocol: {@link interrupt}, {@link setPermissionMode}, {@link setModel}
 * - {@link onControlRequest} to intercept incoming control requests (e.g. tool permissions)
 *
 * Messages are yielded as `SDKMessage` from `@anthropic-ai/claude-agent-sdk` —
 * the exact types the Claude Code CLI emits.
 *
 * @category Connection
 */
export class ClaudeAxonConnection {
  /** The Axon channel ID this connection is bound to. */
  readonly axonId: string;

  /** The Runloop devbox ID. */
  readonly devboxId: string;

  /**
   * Whether the connection has been fully initialized (transport connected,
   * read loop active, and protocol handshake complete).
   * Returns `false` before {@link initialize} resolves or after the read loop ends.
   */
  get isInitialized(): boolean {
    return this.handshakeComplete && this.readLoopRunning && !this.closed;
  }

  /**
   * Whether the connection has been disconnected.
   * Returns `true` after {@link disconnect} has been called.
   */
  get isDisconnected(): boolean {
    return this.closed;
  }

  /** Low-level transport that reads/writes messages over the Axon channel. */
  private transport: Transport;

  /** Resolved options (user-provided values merged with defaults). */
  private options: ClaudeAxonConnectionOptions;

  /** Error sink for listener exceptions; defaults to `console.error`. */
  private handleError: (error: unknown) => void;

  /** Optional teardown callback invoked by {@link disconnect}. */
  private disconnectFn: (() => void | Promise<void>) | undefined;

  private static readonly MESSAGE_QUEUE_HIGH_WATER_MARK = 1000;

  /** Buffer of SDK messages that arrived before a consumer called {@link nextMessage}. */
  private messageQueue: SDKMessage[] = [];
  private messageQueueWarned = false;

  /** Promise resolvers waiting for the next SDK message. */
  private messageWaiters: Array<(msg: SDKMessage | null) => void> = [];

  /** Whether the background read loop has been started. */
  private readLoopRunning = false;

  /** Whether the initialize handshake has completed successfully. */
  private handshakeComplete = false;

  /** Whether the background read loop has finished (stream ended or errored). */
  private readLoopDone = false;

  /** Monotonically increasing counter used to generate unique control request IDs. */
  private requestCounter = 0;

  /** In-flight control requests awaiting a response from the CLI. */
  private pendingControlRequests = new Map<string, PendingControlRequest>();

  /** Whether {@link disconnect} has been called. */
  private closed = false;
  private streamAborted = false;

  /** User-registered handlers for incoming control requests, keyed by subtype. */
  // biome-ignore lint/suspicious/noExplicitAny: handlers are typed at registration via onControlRequest()
  private controlRequestHandlers = new Map<string, ControlRequestHandler<any>>();

  /** Registered raw Axon event listeners. */
  private axonEventListeners: ListenerSet<AxonEventListener>;

  private log: (tag: string, ...args: unknown[]) => void;

  /**
   * Creates a new Claude connection over the given Axon channel and devbox.
   *
   * Unlike ACP, the transport is not opened until {@link initialize} is called.
   *
   * @param axon    - The Axon channel to communicate over (from `@runloop/api-client`).
   * @param devbox  - The Runloop devbox hosting the Claude Code agent.
   * @param options - Optional configuration for verbose logging, system prompt,
   *   model selection, error handling, and lifecycle hooks.
   */
  constructor(axon: Axon, devbox: Devbox, options?: ClaudeAxonConnectionOptions) {
    this.axonId = axon.id;
    this.devboxId = devbox.id;
    this.options = options ?? {};
    this.handleError = options?.onError ?? makeDefaultOnError("ClaudeAxonConnection");
    this.disconnectFn = options?.onDisconnect;
    this.log = makeLogger("claude-sdk", options?.verbose ?? false);
    this.axonEventListeners = new ListenerSet<AxonEventListener>(this.handleError);
    this.transport = new AxonTransport(axon, {
      verbose: this.options.verbose,
      onAxonEvent: (ev) => this.axonEventListeners.emit(ev),
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Opens the transport, starts the background read loop, performs the
   * `initialize` handshake, and optionally sets the model.
   *
   * @throws If this instance has already been disconnected (connections
   *   are single-use — create a new instance instead).
   */
  async initialize(): Promise<void> {
    if (this.closed) {
      throw new Error(
        "This ClaudeAxonConnection has already been disconnected and cannot be reused. Create a new instance.",
      );
    }
    if (this.readLoopRunning) {
      throw new Error("Already initialized. Call disconnect() before reinitializing.");
    }
    await this.transport.connect();
    this.startReadLoop();

    await this.sendInitialize();
    this.handshakeComplete = true;

    if (this.options.model) {
      await this.setModel(this.options.model);
    }
  }

  /**
   * Aborts the underlying SSE stream without clearing registered listeners
   * or running the `onDisconnect` callback.
   *
   * Unlike {@link disconnect}, listeners remain registered. Note that after
   * calling this method, the connection cannot be reused — create a new
   * `ClaudeAxonConnection` instance to reconnect.
   */
  abortStream(): void {
    this.streamAborted = true;
    this.transport.abortStream();
  }

  /**
   * Closes the transport, fails all pending control requests, clears
   * listeners, and runs the `onDisconnect` callback if one was provided.
   *
   * Idempotent — subsequent calls are no-ops.
   *
   * @returns Resolves once all teardown (including `onDisconnect`) completes.
   */
  async disconnect(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // Unblock any waiters and clear buffered messages
    for (const waiter of this.messageWaiters) {
      waiter(null);
    }
    this.messageWaiters.length = 0;
    this.messageQueue.length = 0;

    this.handshakeComplete = false;

    // Fail pending control requests
    for (const [, pending] of this.pendingControlRequests) {
      pending.reject(new Error("Client disconnected"));
    }
    this.pendingControlRequests.clear();
    this.axonEventListeners.clear();
    this.controlRequestHandlers.clear();

    await this.transport.close();
    await runDisconnectHook(this.disconnectFn, this.log, this.handleError);
  }

  // -----------------------------------------------------------------------
  // Axon event listeners
  // -----------------------------------------------------------------------

  /**
   * Registers a listener for every Axon event (before origin filtering).
   * Useful for debugging, observability, and building Axon event viewers.
   *
   * @param listener - Callback invoked with the raw {@link AxonEventView}
   *   for every event on the channel, regardless of origin.
   * @returns An unsubscribe function that removes the listener.
   */
  onAxonEvent(listener: AxonEventListener): () => void {
    return this.axonEventListeners.add(listener);
  }

  // -----------------------------------------------------------------------
  // Read loop — routes control messages vs SDK messages
  // -----------------------------------------------------------------------

  /**
   * Spawns a background async loop that reads messages from the transport
   * and routes them via {@link routeMessage}. On error, all pending control
   * requests are failed. When the loop ends (normally or via error), all
   * message waiters are unblocked with `null`.
   */
  private startReadLoop(): void {
    if (this.readLoopRunning) return;
    this.readLoopRunning = true;

    (async () => {
      let reconnected = false;

      const consumeStream = async (): Promise<"ended" | "error"> => {
        try {
          for await (const message of this.transport.readMessages()) {
            if (this.closed) return "ended";
            this.routeMessage(message);
          }
          return "ended";
        } catch (err) {
          this.log("readLoop", `error: ${err}`);
          for (const [, pending] of this.pendingControlRequests) {
            pending.reject(err instanceof Error ? err : new Error(String(err)));
          }
          this.pendingControlRequests.clear();
          return "error";
        }
      };

      const outcome = await consumeStream();

      if (!this.closed && !this.streamAborted && !reconnected) {
        const label = outcome === "error" ? "error" : "ended unexpectedly";
        console.warn(`[ClaudeAxonConnection] SSE stream ${label}, reconnecting...`);
        reconnected = true;
        this.handshakeComplete = false;
        try {
          await this.transport.reconnect();

          const reInitialize = async () => {
            await this.sendInitialize();
            this.handshakeComplete = true;
            if (this.options.model) {
              await this.setModel(this.options.model);
            }
            console.warn("[ClaudeAxonConnection] Reconnected successfully");
          };

          await Promise.all([consumeStream(), reInitialize()]);
        } catch (reconnectErr) {
          this.log("readLoop", `reconnect failed: ${reconnectErr}`);
        }
      }

      this.readLoopDone = true;
      this.readLoopRunning = false;
      this.streamAborted = false;
      for (const waiter of this.messageWaiters) {
        waiter(null);
      }
      this.messageWaiters.length = 0;
    })();
  }

  /**
   * Dispatches a single inbound wire message to the correct handler:
   * - `control_response` → resolves or rejects the matching pending request.
   * - `control_request`  → delegates to {@link handleIncomingControlRequest}.
   * - `control_cancel_request` → silently dropped (no-op).
   * - Everything else → treated as an `SDKMessage` and delivered to
   *   the next {@link nextMessage} waiter or buffered in the message queue.
   *
   * @param message - The parsed wire-level message from the transport.
   */
  private routeMessage(message: WireData): void {
    if (this.closed) return;
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

    // Control request from CLI — validate shape before handling
    if (msgType === "control_request") {
      if (
        typeof message.request_id !== "string" ||
        typeof message.request !== "object" ||
        message.request === null
      ) {
        this.log("routeMessage", "malformed control_request — missing request_id or request");
        return;
      }
      this.handleIncomingControlRequest(message as SDKControlRequest).catch((err) => {
        this.log("control", `handler error: ${err}`);
        this.handleError(err);
      });
      return;
    }

    // Control cancel request
    if (msgType === "control_cancel_request") {
      return;
    }

    // Regular SDK message — validate it has a string type before casting
    if (typeof msgType !== "string") {
      this.log("routeMessage", "dropping message with non-string type");
      return;
    }
    const sdkMessage = message as SDKMessage;
    if (this.messageWaiters.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: guarded by .length > 0 check above
      const waiter = this.messageWaiters.shift()!;
      waiter(sdkMessage);
    } else {
      this.messageQueue.push(sdkMessage);
      if (
        !this.messageQueueWarned &&
        this.messageQueue.length >= ClaudeAxonConnection.MESSAGE_QUEUE_HIGH_WATER_MARK
      ) {
        this.messageQueueWarned = true;
        console.warn(
          `[ClaudeAxonConnection] Message queue has ${this.messageQueue.length} buffered messages. ` +
            "Ensure you are consuming messages via receiveMessages() or receiveResponse().",
        );
      }
    }
  }

  /**
   * Returns the next buffered SDK message, or waits for one to arrive.
   * Resolves with `null` when the read loop has ended or the connection
   * has been closed.
   *
   * @returns The next SDK message, or `null` if no more messages will arrive.
   */
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

  /**
   * Sends a control request to the CLI and waits for the matching response.
   *
   * Internally assigns a unique request ID, publishes the request via the
   * transport, and returns a promise that resolves when the CLI sends a
   * `control_response` with the same ID. Times out if no response arrives
   * within `timeoutMs`.
   *
   * @param request   - The control request payload (must include a `subtype`).
   * @param timeoutMs - Maximum time to wait for the response (default 60 s).
   * @returns The `response` field from the successful `control_response`.
   * @throws On timeout, error-subtype responses, or transport failures.
   */
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

  /**
   * Sends the `initialize` control request to the Claude Code CLI,
   * including system prompt overrides if configured.
   *
   * Uses a longer timeout (120 s) because the agent may need to start up.
   *
   * @returns The CLI's initialization response payload.
   * @throws On timeout or if the CLI rejects initialization.
   */
  private async sendInitialize(): Promise<WireData> {
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

  /**
   * Handle an incoming control request from the CLI (e.g. permission, hook).
   *
   * If a handler has been registered for the request's subtype via
   * {@link onControlRequest}, it is called and its return value is sent
   * as the response. Otherwise, built-in defaults are used:
   *
   * - `can_use_tool` → auto-allow with the original input
   * - `hook_callback` → continue without modification
   * - `mcp_message`  → error (not supported)
   *
   * If the handler or default logic throws, an error response is sent
   * back to the CLI so it does not hang waiting.
   *
   * **Important:** If you override the handler via {@link onControlRequest},
   * you **must** handle `can_use_tool` permission requests yourself, or
   * include `--dangerously-skip-permissions` in the `launch_args` passed to
   * the broker mount. Failing to do so will cause the CLI to hang waiting
   * for a permission response that never arrives.
   *
   * @param message - The incoming `SDKControlRequest` from the CLI.
   */
  private async handleIncomingControlRequest(message: SDKControlRequest): Promise<void> {
    if (this.closed) return;
    const requestId = message.request_id;
    const request = message.request;

    try {
      let controlResponse: SDKControlResponse;

      // Check for a registered handler for this subtype
      const handler = this.controlRequestHandlers.get(request.subtype);
      if (handler) {
        controlResponse = await handler(message);
      } else {
        // Built-in defaults when no handler is registered
        let responseData: WireData = {};
        switch (request.subtype) {
          case "can_use_tool": {
            const permReq: ControlRequestOfSubtype<"can_use_tool"> = request;
            // Default: allow all tools
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
        controlResponse = {
          type: "control_response",
          response: {
            subtype: "success",
            request_id: requestId,
            response: responseData,
          },
        };
      }

      if (!this.closed) {
        await this.transport.write(JSON.stringify(controlResponse));
      }
    } catch (err) {
      if (this.closed) return;
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
   * Sends a single user message to Claude.
   *
   * If given a plain string, it is automatically wrapped into an
   * `SDKUserMessage` with `role: "user"`. Pass a pre-built
   * `SDKUserMessage` for full control (e.g. to set `parent_tool_use_id`).
   *
   * @param prompt - A string message or a fully formed `SDKUserMessage`.
   *
   * @example
   * ```ts
   * await conn.send("What files are in this directory?");
   * ```
   */
  async send(prompt: string | SDKUserMessage): Promise<void> {
    if (this.closed) {
      throw new Error("Connection is disconnected. Cannot send messages.");
    }
    if (!this.readLoopRunning) {
      throw new Error("Connection is not initialized. Call initialize() first.");
    }
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
   * Async iterator that yields every `SDKMessage` from Claude indefinitely.
   *
   * Does **not** stop at `result` messages — use {@link receiveResponse}
   * for single-turn convenience. Iteration ends when the transport closes
   * or {@link disconnect} is called.
   *
   * @yields Each `SDKMessage` as it arrives from the agent.
   */
  async *receiveMessages(): AsyncGenerator<SDKMessage, void, undefined> {
    while (true) {
      const msg = await this.nextMessage();
      if (msg === null) return;
      yield msg;
    }
  }

  /**
   * Async iterator that yields `SDKMessage`s until (and including) a
   * `result` message, then terminates automatically.
   *
   * Convenient for single-turn usage: send a prompt, iterate
   * `receiveResponse()`, and the loop ends when Claude finishes.
   *
   * @yields Each `SDKMessage` up to and including the `result`.
   *
   * @example
   * ```ts
   * await conn.send("Summarize this file.");
   * for await (const msg of conn.receiveResponse()) {
   *   console.log(msg.type, msg);
   * }
   * ```
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

  /**
   * Interrupts the current conversation turn.
   *
   * @throws On timeout or if the CLI rejects the interrupt.
   */
  async interrupt(): Promise<void> {
    await this.sendControlRequest({ subtype: "interrupt" });
  }

  /**
   * Changes the permission mode for tool use.
   *
   * @param mode - The new permission mode (e.g. `"default"`, `"acceptEdits"`).
   * @throws On timeout or if the CLI rejects the mode change.
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    await this.sendControlRequest({
      subtype: "set_permission_mode",
      mode,
    });
  }

  /**
   * Changes the AI model used by Claude Code.
   *
   * @param model - Anthropic model identifier (e.g. `"claude-sonnet-4-5"`),
   *   or `null` to revert to the agent's default.
   * @throws On timeout or if the CLI rejects the model change.
   */
  async setModel(model: string | null): Promise<void> {
    await this.sendControlRequest({
      subtype: "set_model",
      model,
    });
  }

  /**
   * Register a handler for incoming control requests of a given subtype.
   *
   * When Claude Code sends a control request (e.g. asking permission to use
   * a tool), the registered handler is called instead of the built-in default.
   * The handler receives the full {@link SDKControlRequest} and must return
   * a complete {@link SDKControlResponse}. The connection sends it back as-is.
   *
   * Only one handler can be registered per subtype. Calling this method again
   * with the same subtype replaces the previous handler.
   *
   * @param subtype - The control request subtype to handle (e.g. "can_use_tool").
   * @param handler - Async function that processes the request and returns a full SDKControlResponse.
   *
   * @example
   * ```ts
   * connection.onControlRequest("can_use_tool", async (message) => {
   *   return {
   *     type: "control_response",
   *     response: {
   *       subtype: "success",
   *       request_id: message.request_id,
   *       response: { behavior: "allow", updatedInput: message.request.input },
   *     },
   *   };
   * });
   * ```
   */
  onControlRequest<S extends ControlRequestInner["subtype"]>(
    subtype: S,
    handler: ControlRequestHandler<S>,
  ): () => void {
    this.controlRequestHandlers.set(subtype, handler);
    return () => {
      if (this.controlRequestHandlers.get(subtype) === handler) {
        this.controlRequestHandlers.delete(subtype);
      }
    };
  }
}
