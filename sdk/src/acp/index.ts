/**
 * ACP (Agent Client Protocol) module for connecting to ACP-compatible agents
 * running inside Runloop devboxes via the Axon event bus.
 *
 * **Getting started:** Create an {@link ACPAxonConnection} with your Axon
 * channel, call {@link ACPAxonConnection.initialize | initialize()}, then
 * use {@link ACPAxonConnection.newSession | newSession()} and
 * {@link ACPAxonConnection.prompt | prompt()} to interact with the agent.
 * Subscribe to streaming updates with
 * {@link ACPAxonConnection.onSessionUpdate | onSessionUpdate()} and narrow
 * them using the type guard functions.
 *
 * @categoryDescription Connection
 * The main connection class and its low-level stream factory.
 *
 * @categoryDescription Configuration
 * Options, callbacks, and listener types used when creating a connection.
 *
 * @categoryDescription Session Updates
 * Type guards and narrowed types for discriminating {@link SessionUpdate} variants
 * received via {@link ACPAxonConnection.onSessionUpdate | onSessionUpdate()}.
 *
 * @categoryDescription ACP Protocol
 * Re-exported request/response types and constants from the upstream
 * `@agentclientprotocol/sdk`. Use these to type method parameters.
 *
 * @module
 */

/** @category ACP Protocol */
export type * from "@agentclientprotocol/sdk";

/** @category ACP Protocol */
export type {
  AuthenticateRequest,
  AuthenticateResponse,
  CancelNotification,
  InitializeRequest,
  InitializeResponse,
  ListSessionsRequest,
  ListSessionsResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  SessionUpdate,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
  SetSessionModeRequest,
  SetSessionModeResponse,
  Stream,
} from "@agentclientprotocol/sdk";

/** @category ACP Protocol */
export {
  CLIENT_METHODS,
  ClientSideConnection,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
export { parseTimelinePayload, tryParseSystemEvent } from "../shared/timeline.js";
export type {
  AxonEventListener,
  AxonEventView,
  BaseConnectionOptions,
  SystemEvent,
  SystemTimelineEvent,
  TimelineEventListener,
  UnrecognizedTimelineEvent,
} from "../shared/types.js";
export { type ExtractedUserMessage, extractACPUserMessage } from "../shared/user-message.js";
export { axonStream } from "./axon-stream.js";
export { ACPAxonConnection, classifyACPAxonEvent } from "./connection.js";
export type {
  AgentMessageChunkUpdate,
  AgentThoughtChunkUpdate,
  AvailableCommandsSessionUpdate,
  ConfigOptionSessionUpdate,
  CurrentModeSessionUpdate,
  PlanSessionUpdate,
  SessionInfoSessionUpdate,
  ToolCallProgressSessionUpdate,
  ToolCallSessionUpdate,
  UsageSessionUpdate,
  UserMessageChunkUpdate,
} from "./session-update-guards.js";
export {
  isAgentMessageChunk,
  isAgentThoughtChunk,
  isAvailableCommandsUpdate,
  isConfigOptionUpdate,
  isCurrentModeUpdate,
  isPlan,
  isSessionInfoUpdate,
  isToolCall,
  isToolCallProgress,
  isUsageUpdate,
  isUserMessageChunk,
} from "./session-update-guards.js";
export type {
  ACPAxonConnectionOptions,
  ACPProtocolTimelineEvent,
  ACPTimelineEvent,
  AxonStreamOptions,
  CreateClientFn,
  SessionUpdateListener,
} from "./types.js";
