import type {
  Agent,
  Client,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { Axon } from "@runloop/api-client/sdk";
import type {
  BaseConnectionOptions,
  SystemTimelineEvent,
  UnknownTimelineEvent,
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
 * @todo Consider a composition-based approach (e.g. accepting partial
 * overrides that merge with defaults) so callers don't have to
 * reimplement the entire `Client` interface.
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
 * A `session/update` timeline event. `data` is the parsed `SessionUpdate`.
 * @category Timeline
 */
export interface ACPSessionUpdateTimelineEvent {
  kind: "acp_protocol";
  eventType: "session/update";
  data: SessionUpdate;
  axonEvent: AxonEventView;
}

/**
 * An `initialize` timeline event.
 * @category Timeline
 */
export interface ACPInitializeTimelineEvent {
  kind: "acp_protocol";
  eventType: "initialize";
  data: InitializeRequest | InitializeResponse;
  axonEvent: AxonEventView;
}

/**
 * A `session/prompt` timeline event.
 * @category Timeline
 */
export interface ACPPromptTimelineEvent {
  kind: "acp_protocol";
  eventType: "session/prompt";
  data: PromptRequest | PromptResponse;
  axonEvent: AxonEventView;
}

/**
 * A `session/new` timeline event.
 * @category Timeline
 */
export interface ACPNewSessionTimelineEvent {
  kind: "acp_protocol";
  eventType: "session/new";
  data: NewSessionRequest | NewSessionResponse;
  axonEvent: AxonEventView;
}

/**
 * A recognized ACP protocol event whose `eventType` is not one of the
 * specifically typed variants above.
 *
 * Use `axonEvent.origin` to determine direction:
 * - `USER_EVENT` = outbound (client sent this)
 * - `AGENT_EVENT` = inbound (agent sent this)
 *
 * @category Timeline
 */
export interface ACPOtherProtocolTimelineEvent {
  kind: "acp_protocol";
  eventType: string;
  data: unknown;
  axonEvent: AxonEventView;
}

/**
 * Discriminated union of all ACP protocol timeline event variants.
 * Switch on `eventType` to narrow the `data` type.
 * @category Timeline
 */
export type ACPProtocolTimelineEvent =
  | ACPSessionUpdateTimelineEvent
  | ACPInitializeTimelineEvent
  | ACPPromptTimelineEvent
  | ACPNewSessionTimelineEvent
  | ACPOtherProtocolTimelineEvent;

/**
 * Union of all timeline event types emitted by the ACP connection.
 * @category Timeline
 */
export type ACPTimelineEvent =
  | ACPProtocolTimelineEvent
  | SystemTimelineEvent
  | UnknownTimelineEvent;
