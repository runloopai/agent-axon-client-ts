import {
  type Agent,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type CancelNotification,
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
import { axonStream } from "./axon-stream.js";
import type {
  ACPAxonConnectionOptions,
  AxonEventListener,
  SessionUpdateListener,
} from "./types.js";

function defaultOnError(error: unknown): void {
  console.error("[ACPAxonConnection]", error);
}

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

  /** The Runloop devbox ID, if supplied in connection options. */
  readonly devboxId: string | undefined;

  /**
   * The underlying ACP SDK `ClientSideConnection`.
   *
   * Use this for direct access to experimental/unstable protocol methods
   * (e.g. `unstable_forkSession`, `unstable_closeSession`). For stable
   * methods, prefer the proxied methods on this class directly.
   */
  readonly protocol: ClientSideConnection;

  private abortController: AbortController;
  private sessionUpdateListeners = new Set<SessionUpdateListener>();
  private axonEventListeners = new Set<AxonEventListener>();
  private handleError: (error: unknown) => void;
  private handlePermission:
    | ((params: RequestPermissionRequest) => Promise<RequestPermissionResponse>)
    | undefined;
  private shutdownFn: (() => Promise<void>) | undefined;

  constructor(options: ACPAxonConnectionOptions) {
    this.axonId = options.axon.id;
    this.devboxId = options.devboxId;
    this.abortController = new AbortController();
    this.handleError = options.onError ?? defaultOnError;
    this.handlePermission = options.requestPermission;
    this.shutdownFn = options.shutdown;

    const stream = axonStream({
      axon: options.axon,
      signal: this.abortController.signal,
      onAxonEvent: (ev) => this.emitAxonEvent(ev),
      onError: this.handleError,
      onDisconnect: options.onDisconnect,
    });

    this.protocol = new ClientSideConnection((_agent: Agent) => this.createClient(), stream);
  }

  // ---------------------------------------------------------------------------
  // Proxied Agent methods
  // ---------------------------------------------------------------------------

  /** Establishes the connection and negotiates protocol capabilities. */
  initialize(params: InitializeRequest): Promise<InitializeResponse> {
    return this.protocol.initialize(params);
  }

  /** Creates a new conversation session with the agent. */
  newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    return this.protocol.newSession(params);
  }

  /** Loads an existing session to resume a previous conversation. */
  loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    return this.protocol.loadSession(params);
  }

  /** Lists existing sessions from the agent. */
  listSessions(params: ListSessionsRequest): Promise<ListSessionsResponse> {
    return this.protocol.listSessions(params);
  }

  /** Sends a user prompt within a session and processes the agent's turn. */
  prompt(params: PromptRequest): Promise<PromptResponse> {
    return this.protocol.prompt(params);
  }

  /** Cancels an ongoing prompt turn for a session. */
  cancel(params: CancelNotification): Promise<void> {
    return this.protocol.cancel(params);
  }

  /** Authenticates using a method advertised during initialization. */
  authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse> {
    return this.protocol.authenticate(params);
  }

  /** Sets the operational mode for a session (e.g. "ask", "code"). */
  setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    return this.protocol.setSessionMode(params);
  }

  /** Sets a configuration option for a session. */
  setSessionConfigOption(
    params: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse> {
    return this.protocol.setSessionConfigOption(params);
  }

  /** Sends an arbitrary extension request not part of the ACP spec. */
  extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.protocol.extMethod(method, params);
  }

  /** Sends an arbitrary extension notification not part of the ACP spec. */
  extNotification(method: string, params: Record<string, unknown>): Promise<void> {
    return this.protocol.extNotification(method, params);
  }

  // ---------------------------------------------------------------------------
  // Event listeners
  // ---------------------------------------------------------------------------

  /**
   * Registers a listener for `session/update` notifications from the agent.
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
   * Useful for debugging and observability.
   * @returns An unsubscribe function that removes the listener.
   */
  onAxonEvent(listener: AxonEventListener): () => void {
    this.axonEventListeners.add(listener);
    return () => {
      this.axonEventListeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** AbortSignal that fires when the connection closes. */
  get signal(): AbortSignal {
    return this.protocol.signal;
  }

  /** Promise that resolves when the connection closes. */
  get closed(): Promise<void> {
    return this.protocol.closed;
  }

  /**
   * Aborts the underlying SSE stream without clearing registered listeners.
   *
   * Useful for simulating a transport-level disconnection in tests, or as a
   * building block for reconnect logic. Unlike {@link disconnect}, listeners
   * remain registered so they can fire again if a new stream is established.
   */
  abortStream(): void {
    this.abortController.abort();
  }

  /** Aborts the Axon stream and clears all registered listeners. */
  disconnect(): void {
    this.abortStream();
    this.sessionUpdateListeners.clear();
    this.axonEventListeners.clear();
  }

  /**
   * Disconnects the ACP connection and runs the shutdown callback (e.g. devbox
   * teardown) if one was provided in connection options.
   */
  async shutdown(): Promise<void> {
    this.disconnect();
    await this.shutdownFn?.();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

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
        for (const listener of this.sessionUpdateListeners) {
          try {
            listener(sessionId, update);
          } catch (err) {
            this.handleError(err);
          }
        }
      },
    };
  }

  private emitAxonEvent(event: AxonEventView): void {
    for (const listener of this.axonEventListeners) {
      try {
        listener(event);
      } catch (err) {
        this.handleError(err);
      }
    }
  }
}
