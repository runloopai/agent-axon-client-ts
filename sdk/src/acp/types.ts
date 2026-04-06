import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { Axon } from "@runloop/api-client/sdk";
import type { BaseConnectionOptions } from "../shared/types.js";

export type { AxonEventView } from "@runloop/api-client/resources/axons";
export type { AxonEventListener } from "../shared/types.js";

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
  /** Diagnostic log callback. When provided, the stream emits verbose logs. */
  log?: (tag: string, ...args: unknown[]) => void;
}

/**
 * Options for creating an {@link ACPAxonConnection}.
 * @category Configuration
 */
export interface ACPAxonConnectionOptions extends BaseConnectionOptions {
  /**
   * Custom handler for agent permission requests. Receives the permission
   * options and must return the selected outcome.
   *
   * Defaults to auto-approving with preference:
   * `allow_always` > `allow_once` > first option.
   */
  requestPermission?: (params: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
}

/**
 * Callback invoked on each `session/update` notification from the agent.
 *
 * @param sessionId - The session that emitted the update, or `null` if
 *   the notification did not include a session ID.
 * @param update    - The session update payload (message chunk, tool call, usage, etc.).
 *
 * @category Configuration
 */
export type SessionUpdateListener = (sessionId: string | null, update: SessionUpdate) => void;
