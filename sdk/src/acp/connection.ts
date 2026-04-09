import {
  AGENT_METHODS,
  type Agent,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type CancelNotification,
  CLIENT_METHODS,
  type Client,
  ClientSideConnection,
  type InitializeRequest,
  type InitializeResponse,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
} from "@agentclientprotocol/sdk";
import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { Axon, Devbox } from "@runloop/api-client/sdk";
import { runDisconnectHook } from "../shared/lifecycle.js";
import { ListenerSet } from "../shared/listener-set.js";
import { makeDefaultOnError, makeLogger } from "../shared/logging.js";
import { tryParseSystemEvent } from "../shared/timeline.js";
import type { AxonEventListener, TimelineEventListener } from "../shared/types.js";
import { axonStream } from "./axon-stream.js";
import type { ACPAxonConnectionOptions, ACPTimelineEvent, SessionUpdateListener } from "./types.js";

/** All known ACP protocol event_type strings (agent + client methods). */
const ACP_KNOWN_EVENT_TYPES: Set<string> = new Set([
  ...Object.values(AGENT_METHODS),
  ...Object.values(CLIENT_METHODS),
]);

/**
 * High-level ACP connection backed by an Axon transport.
 *
 * Wraps a `ClientSideConnection` with an `axonStream`, providing:
 * - Proxied ACP agent methods (`initialize`, `prompt`, `newSession`, etc.)
 * - Session update listener registration
 * - Raw Axon event tapping for debugging
 * - Configurable permission handling
 * - Lifecycle management (`signal`, `closed`, `disconnect`)
 *
 * The underlying `ClientSideConnection` is accessible via `.protocol` for
 * advanced use cases (e.g. unstable/experimental ACP methods).
 *
 * @category Connection
 */
export class ACPAxonConnection {
  /** The Axon channel ID this connection is bound to. */
  readonly axonId: string;

  /** The Runloop devbox ID. */
  readonly devboxId: string;

  /**
   * The underlying ACP SDK `ClientSideConnection`.
   *
   * Use this for direct access to experimental/unstable protocol methods
   * (e.g. `unstable_forkSession`, `unstable_closeSession`). For stable
   * methods, prefer the proxied methods on this class directly.
   */
  readonly protocol: ClientSideConnection;

  /** Controller whose signal is passed to the Axon stream; aborting it tears down the SSE subscription. */
  private abortController: AbortController;
  private disconnected = false;

  /** Registered `session/update` notification listeners. */
  private sessionUpdateListeners = new Set<SessionUpdateListener>();

  /** Registered raw Axon event listeners (fired before JSON-RPC translation). */
  private axonEventListeners: ListenerSet<AxonEventListener>;

  /** Registered timeline event listeners. */
  private timelineEventListeners: ListenerSet<TimelineEventListener<ACPTimelineEvent>>;

  /** Error sink for listener exceptions and stream parse failures. */
  private handleError: (error: unknown) => void;

  /** Optional user-provided permission handler; when unset the built-in auto-approve logic is used. */
  private handlePermission:
    | ((params: RequestPermissionRequest) => Promise<RequestPermissionResponse>)
    | undefined;

  /** Optional teardown callback invoked by {@link disconnect}. */
  private disconnectFn: (() => void | Promise<void>) | undefined;

  private log: (tag: string, ...args: unknown[]) => void;

  /**
   * Creates a new ACP connection over the given Axon channel and devbox.
   *
   * The constructor immediately opens an SSE subscription on the Axon
   * channel. Connection errors surface on the first awaited method call
   * (typically {@link initialize}).
   *
   * @param axon    - The Axon channel to communicate over (from `@runloop/api-client`).
   * @param devbox  - The Runloop devbox hosting the ACP agent.
   * @param options - Optional configuration for error handling, permissions, and lifecycle hooks.
   */
  constructor(axon: Axon, devbox: Devbox, options?: ACPAxonConnectionOptions) {
    this.axonId = axon.id;
    this.devboxId = devbox.id;
    this.abortController = new AbortController();
    this.log = makeLogger("acp-sdk", options?.verbose ?? false);
    this.handleError = options?.onError ?? makeDefaultOnError("ACPAxonConnection");
    this.handlePermission = options?.requestPermission;
    this.disconnectFn = options?.onDisconnect;
    this.axonEventListeners = new ListenerSet<AxonEventListener>(this.handleError);
    this.timelineEventListeners = new ListenerSet<TimelineEventListener<ACPTimelineEvent>>(
      this.handleError,
    );

    const verbose = options?.verbose ?? false;
    const stream = axonStream({
      axon,
      signal: this.abortController.signal,
      onAxonEvent: (ev) => {
        this.axonEventListeners.emit(ev);
        this.emitTimelineEvent(ev);
      },
      onError: this.handleError,
      log: verbose ? (tag, ...args) => this.log(tag, ...args) : undefined,
      afterSequence: options?.afterSequence,
    });

    this.protocol = new ClientSideConnection((_agent: Agent) => this.createClient(), stream);
    this.log("constructor", `axon=${axon.id} devbox=${this.devboxId}`);
  }

  private ensureConnected(): void {
    if (this.disconnected) {
      throw new Error("Connection is disconnected. Create a new instance.");
    }
  }

  // ---------------------------------------------------------------------------
  // Proxied Agent methods
  // ---------------------------------------------------------------------------

  /**
   * Establishes the connection and negotiates protocol capabilities.
   * Must be called before any other agent method.
   *
   * @param params - Protocol version, client info, and capability negotiation fields.
   * @returns The agent's supported capabilities and protocol version.
   */
  initialize(params: InitializeRequest): Promise<InitializeResponse> {
    this.ensureConnected();
    return this.protocol.initialize(params);
  }

  /**
   * Creates a new conversation session with the agent.
   *
   * @param params - Session configuration including working directory and MCP servers.
   * @returns The newly created session ID and metadata.
   */
  newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    this.ensureConnected();
    return this.protocol.newSession(params);
  }

  /**
   * Loads an existing session to resume a previous conversation.
   *
   * @param params - Identifies the session to load.
   * @returns The restored session metadata.
   */
  loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    this.ensureConnected();
    return this.protocol.loadSession(params);
  }

  /**
   * Lists existing sessions from the agent.
   *
   * @param params - Optional filter criteria for the session list.
   * @returns An array of session summaries.
   */
  listSessions(params: ListSessionsRequest): Promise<ListSessionsResponse> {
    this.ensureConnected();
    return this.protocol.listSessions(params);
  }

  /**
   * Sends a user prompt within a session and processes the agent's turn.
   *
   * The returned promise resolves when the agent acknowledges the prompt,
   * but session update notifications (tokens, tool calls, messages) may
   * continue arriving after resolution. Listen via {@link onSessionUpdate}
   * to capture the full turn.
   *
   * @param params - Session ID and prompt content.
   * @returns The agent's prompt acknowledgement.
   */
  prompt(params: PromptRequest): Promise<PromptResponse> {
    this.ensureConnected();
    return this.protocol.prompt(params);
  }

  /**
   * Cancels an ongoing prompt turn for a session.
   *
   * @param params - Identifies the session whose turn should be cancelled.
   */
  cancel(params: CancelNotification): Promise<void> {
    this.ensureConnected();
    return this.protocol.cancel(params);
  }

  /**
   * Authenticates using a method advertised during initialization.
   *
   * @param params - Authentication method and credentials.
   * @returns The authentication result.
   */
  authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse> {
    this.ensureConnected();
    return this.protocol.authenticate(params);
  }

  /**
   * Sets the operational mode for a session (e.g. "ask", "code").
   *
   * @param params - Session ID and the target mode.
   * @returns Confirmation of the mode change.
   */
  setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    this.ensureConnected();
    return this.protocol.setSessionMode(params);
  }

  /**
   * Sets a configuration option for a session.
   *
   * @param params - Session ID, option key, and new value.
   * @returns Confirmation of the configuration change.
   */
  setSessionConfigOption(
    params: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse> {
    this.ensureConnected();
    return this.protocol.setSessionConfigOption(params);
  }

  /**
   * Sends an arbitrary extension request not part of the ACP spec.
   *
   * @param method - The custom method name.
   * @param params - Arbitrary key-value payload for the request.
   * @returns The agent's response payload.
   */
  extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.ensureConnected();
    return this.protocol.extMethod(method, params);
  }

  /**
   * Sends an arbitrary extension notification not part of the ACP spec.
   * Unlike {@link extMethod}, notifications do not expect a response.
   *
   * @param method - The custom method name.
   * @param params - Arbitrary key-value payload for the notification.
   */
  extNotification(method: string, params: Record<string, unknown>): Promise<void> {
    this.ensureConnected();
    return this.protocol.extNotification(method, params);
  }

  // ---------------------------------------------------------------------------
  // Event listeners
  // ---------------------------------------------------------------------------

  /**
   * Registers a listener for `session/update` notifications from the agent.
   *
   * @param listener - Callback invoked with the session ID and the update payload
   *   each time the agent emits a session update (message chunks, tool calls, etc.).
   * @returns An unsubscribe function that removes the listener.
   */
  onSessionUpdate(listener: SessionUpdateListener): () => void {
    this.sessionUpdateListeners.add(listener);
    return () => {
      this.sessionUpdateListeners.delete(listener);
    };
  }

  /**
   * Registers a listener for every Axon event (before JSON-RPC translation).
   * Useful for debugging, observability, and building event viewers.
   *
   * @param listener - Callback invoked with the raw {@link AxonEventView}
   *   for every event on the channel, regardless of origin.
   * @returns An unsubscribe function that removes the listener.
   */
  onAxonEvent(listener: AxonEventListener): () => void {
    return this.axonEventListeners.add(listener);
  }

  /**
   * Registers a listener for classified timeline events.
   *
   * Every Axon event on the channel is classified into one of:
   * - `acp_protocol` — a known ACP protocol event (agent or client method)
   * - `system` — a broker system event (`turn.started`, `turn.completed`)
   * - `unrecognized` — anything else
   *
   * @param listener - Callback invoked with each {@link ACPTimelineEvent}.
   * @returns An unsubscribe function that removes the listener.
   */
  onTimelineEvent(listener: TimelineEventListener<ACPTimelineEvent>): () => void {
    return this.timelineEventListeners.add(listener);
  }

  /**
   * Async generator that yields classified timeline events.
   *
   * Mirrors the pull-based pattern of `receiveMessages()` in the Claude
   * module. The generator completes when the connection is disconnected
   * or the abort signal fires.
   *
   * @returns An async generator of {@link ACPTimelineEvent}.
   */
  async *receiveTimelineEvents(): AsyncGenerator<ACPTimelineEvent, void, undefined> {
    const queue: ACPTimelineEvent[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    const unsubscribe = this.onTimelineEvent((event) => {
      queue.push(event);
      resolve?.();
    });

    const onAbort = () => {
      done = true;
      resolve?.();
    };
    this.abortController.signal.addEventListener("abort", onAbort, { once: true });

    try {
      while (!done) {
        if (queue.length > 0) {
          // biome-ignore lint/style/noNonNullAssertion: guarded by .length > 0 check above
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
          resolve = null;
        }
      }
      while (queue.length > 0) {
        // biome-ignore lint/style/noNonNullAssertion: draining remaining items after done
        yield queue.shift()!;
      }
    } finally {
      unsubscribe();
      this.abortController.signal.removeEventListener("abort", onAbort);
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * AbortSignal that fires when the connection closes.
   *
   * @returns The underlying protocol's abort signal.
   */
  get signal(): AbortSignal {
    return this.protocol.signal;
  }

  /**
   * Promise that resolves when the connection closes.
   *
   * @returns A promise that settles once the protocol connection is fully closed.
   */
  get closed(): Promise<void> {
    return this.protocol.closed;
  }

  /**
   * Aborts the underlying SSE stream without clearing registered listeners.
   *
   * Unlike {@link disconnect}, listeners remain registered. Note that after
   * calling this method, the connection cannot be reused — create a new
   * `ACPAxonConnection` instance to reconnect.
   */
  abortStream(): void {
    this.abortController.abort();
  }

  /**
   * Aborts the Axon stream, clears all registered listeners, and runs the
   * `onDisconnect` callback (e.g. devbox teardown) if one was provided.
   *
   * @returns Resolves once the `onDisconnect` callback (if any) completes.
   */
  async disconnect(): Promise<void> {
    if (this.disconnected) return;
    this.disconnected = true;
    this.log("disconnect", "disconnecting");
    this.abortStream();
    this.sessionUpdateListeners.clear();
    this.axonEventListeners.clear();
    this.timelineEventListeners.clear();
    await runDisconnectHook(this.disconnectFn, this.log, this.handleError);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Classifies a raw Axon event and emits it to timeline listeners.
   */
  private emitTimelineEvent(ev: AxonEventView): void {
    const event = classifyACPAxonEvent(ev);
    this.timelineEventListeners.emit(event);
  }

  /**
   * Builds the ACP `Client` callbacks handed to the `ClientSideConnection`.
   *
   * The returned object handles:
   * - `requestPermission` — delegates to the user-provided handler or
   *   falls back to auto-approve (`allow_always` > `allow_once` > first option).
   * - `sessionUpdate` — fans out session update notifications to all
   *   registered {@link onSessionUpdate} listeners.
   *
   * @returns A `Client` implementation wired to this connection's listeners and options.
   */
  private createClient(): Client {
    return {
      requestPermission: async (
        params: RequestPermissionRequest,
      ): Promise<RequestPermissionResponse> => {
        if (this.handlePermission) {
          return this.handlePermission(params);
        }

        const option =
          params.options.find((o: { kind: string }) => o.kind === "allow_always") ??
          params.options.find((o: { kind: string }) => o.kind === "allow_once") ??
          params.options[0];

        if (option) {
          return {
            outcome: { outcome: "selected", optionId: option.optionId },
          };
        }
        return { outcome: { outcome: "cancelled" } };
      },

      sessionUpdate: async (params: SessionNotification): Promise<void> => {
        const sessionId = params.sessionId ?? null;
        const update = params.update;
        for (const listener of [...this.sessionUpdateListeners]) {
          try {
            listener(sessionId, update);
          } catch (err) {
            this.handleError(err);
          }
        }
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Timeline event classification
// ---------------------------------------------------------------------------

/**
 * Classifies a raw Axon event into an {@link ACPTimelineEvent}.
 *
 * Classification rules:
 * 1. `SYSTEM_EVENT` with `turn.started` / `turn.completed` -> `system`
 * 2. Known ACP protocol `event_type` (agent or client method) -> `acp_protocol`
 * 3. Everything else -> `unrecognized`
 *
 * @category Timeline
 */
export function classifyACPAxonEvent(ev: AxonEventView): ACPTimelineEvent {
  if (ev.origin === "SYSTEM_EVENT") {
    const systemEvent = tryParseSystemEvent(ev);
    if (systemEvent) {
      return { kind: "system", data: systemEvent, axonEvent: ev };
    }
  }

  if (ACP_KNOWN_EVENT_TYPES.has(ev.event_type)) {
    let data: unknown = null;
    try {
      data = JSON.parse(ev.payload);
    } catch {
      // leave as null
    }
    return { kind: "acp_protocol", data, axonEvent: ev };
  }

  return { kind: "unrecognized", data: null, axonEvent: ev };
}
