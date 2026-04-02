// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

export { axonStream } from "./axon-stream.js";
export { ACPAxonConnection } from "./connection.js";

// ---------------------------------------------------------------------------
// Library types
// ---------------------------------------------------------------------------

export type {
  ACPAxonConnectionOptions,
  AgentLaunchConfig,
  AxonEventView,
  AxonStreamOptions,
  RawEventListener,
  SessionUpdateListener,
} from "./types.js";

// ---------------------------------------------------------------------------
// Session update type guards & narrowed types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ACP protocol re-exports — types used in this library's public API
// ---------------------------------------------------------------------------

// Full upstream type surface for advanced consumers who need access to
// additional ACP protocol types beyond what this library's API requires.
export type * from "@agentclientprotocol/sdk";

export type {
  // Authentication
  AuthenticateRequest,
  AuthenticateResponse,
  CancelNotification,
  // Initialization
  InitializeRequest,
  InitializeResponse,
  ListSessionsRequest,
  ListSessionsResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  // Sessions
  NewSessionRequest,
  NewSessionResponse,
  // Prompting
  PromptRequest,
  PromptResponse,
  // Permissions
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  // Session updates
  SessionUpdate,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
  // Session configuration
  SetSessionModeRequest,
  SetSessionModeResponse,
  // Stream primitive
  Stream,
} from "@agentclientprotocol/sdk";
export {
  CLIENT_METHODS,
  ClientSideConnection,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
