import type {
  Agent,
  Client,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { Axon } from "@runloop/api-client/sdk";
import type {
  BaseConnectionOptions,
  SystemTimelineEvent,
  UnrecognizedTimelineEvent,
} from "../shared/types.js";

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
  /**
   * Axon sequence number to resume from. When set, the initial SSE
   * subscription starts **after** this sequence — earlier events are skipped.
   * Omit to replay the full event history.
   */
  afterSequence?: number;
}

/**
 * Factory function that creates a {@link Client} implementation for the
 * underlying `ClientSideConnection`.
 *
 * Receives the `Agent` proxy (so the client can call back into the agent
 * if needed) and must return a `Client` that handles agent-to-client
 * requests such as `requestPermission`, `sessionUpdate`, file I/O,
 * terminal management, and elicitation.
 *
 * @category Configuration
 */
export type CreateClientFn = (agent: Agent) => Client;

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
   *
   * Ignored when {@link createClient} is provided (the custom client is
   * responsible for handling permissions).
   */
  requestPermission?: (params: RequestPermissionRequest) => Promise<RequestPermissionResponse>;

  /**
   * Provide a full custom {@link Client} implementation for the underlying
   * `ClientSideConnection`. Use this when you need to handle agent-to-client
   * callbacks beyond permissions and session updates — for example file I/O,
   * terminal management, or elicitation.
   *
   * When set, the built-in `requestPermission` / `onSessionUpdate` wiring is
   * bypassed — the returned `Client` is used as-is.
   */
  createClient?: CreateClientFn;
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

// ---------------------------------------------------------------------------
// Timeline events
// ---------------------------------------------------------------------------

/**
 * A timeline event carrying a recognized ACP protocol event.
 * `data` is the parsed payload — for `session/update` this is a `SessionUpdate`,
 * for other protocol methods it is the raw parsed JSON.
 *
 * Use `axonEvent.origin` to determine direction:
 * - `USER_EVENT` = outbound (client sent this)
 * - `AGENT_EVENT` = inbound (agent sent this)
 *
 * @category Timeline
 */
export interface ACPProtocolTimelineEvent {
  kind: "acp_protocol";
  data: SessionUpdate | unknown;
  axonEvent: AxonEventView;
}

/**
 * Union of all timeline event types emitted by the ACP connection.
 * @category Timeline
 */
export type ACPTimelineEvent =
  | ACPProtocolTimelineEvent
  | SystemTimelineEvent
  | UnrecognizedTimelineEvent;
