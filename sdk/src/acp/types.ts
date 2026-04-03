import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { Axon } from "@runloop/api-client/sdk";

export type { AxonEventView } from "@runloop/api-client/resources/axons";

/**
 * Configuration for creating a low-level Axon stream via {@link axonStream}.
 * @category Configuration
 */
export interface AxonStreamOptions {
  /** Axon channel to connect to (from `@runloop/api-client`). */
  axon: Axon;
  /** AbortSignal to cancel the SSE connection and stop publishing. */
  signal?: AbortSignal;
  /** Called for every Axon event before JSON-RPC translation. */
  onAxonEvent?: (event: AxonEventView) => void;
  /**
   * Called when a non-critical error occurs (e.g. unparseable SSE event).
   * Defaults to `console.error`.
   */
  onError?: (error: unknown) => void;
  /**
   * Called when the SSE stream disconnects (either cleanly or due to error).
   * Not called when the stream is intentionally aborted via `signal`.
   */
  onDisconnect?: () => void;
}

/**
 * Options for creating an {@link ACPAxonConnection}.
 * @category Configuration
 */
export interface ACPAxonConnectionOptions {
  /** Axon channel to connect to (from `@runloop/api-client`). */
  axon: Axon;
  /**
   * Custom handler for agent permission requests. Receives the permission
   * options and must return the selected outcome.
   *
   * Defaults to auto-approving with preference:
   * `allow_always` > `allow_once` > first option.
   */
  requestPermission?: (params: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
  /**
   * Called when a non-critical error occurs (e.g. unparseable event,
   * listener exception). Defaults to `console.error`.
   */
  onError?: (error: unknown) => void;
  /**
   * Called when the SSE stream disconnects (either cleanly or due to error).
   * Not called when the stream is intentionally aborted via `signal`.
   */
  onDisconnect?: () => void;
  /** Runloop devbox ID, for observability or logging. */
  devboxId?: string;
  /**
   * Async teardown callback invoked by `shutdown()` (e.g. devbox shutdown).
   */
  shutdown?: () => Promise<void>;
}

/**
 * Callback invoked on each `session/update` notification from the agent.
 * @category Configuration
 */
export type SessionUpdateListener = (sessionId: string | null, update: SessionUpdate) => void;

/**
 * Callback invoked for every Axon event before JSON-RPC translation.
 * @category Configuration
 */
export type AxonEventListener = (event: AxonEventView) => void;
