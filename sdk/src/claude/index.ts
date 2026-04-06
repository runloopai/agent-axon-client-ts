/**
 * Claude module for connecting to Claude Code instances running inside
 * Runloop devboxes via the Axon event bus.
 *
 * **Getting started:** Create a {@link ClaudeAxonConnection} with an
 * Axon channel and devbox ID, call
 * {@link ClaudeAxonConnection.initialize | initialize()}, then use
 * {@link ClaudeAxonConnection.send | send()} and
 * {@link ClaudeAxonConnection.receiveResponse | receiveResponse()} to
 * interact with Claude Code.
 *
 * @categoryDescription Connection
 * The main connection class for interacting with Claude Code.
 *
 * @categoryDescription Configuration
 * Options, callbacks, and listener types used when creating a connection.
 *
 * @categoryDescription Transport
 * Low-level transport layer that bridges Axon SSE streams and the Claude
 * wire protocol. Most users won't need this directly.
 *
 * @categoryDescription Claude SDK
 * Re-exported message and control types from the upstream
 * `@anthropic-ai/claude-agent-sdk`. Use these to type method parameters
 * and narrow response messages.
 *
 * @module
 */

// Full upstream type surface for consumers who need additional Claude SDK
// types beyond what this library's API explicitly re-exports below.
export type * from "@anthropic-ai/claude-agent-sdk";

/** @category Claude SDK */
export type {
  PermissionMode,
  SDKAPIRetryMessage,
  SDKAssistantMessage,
  SDKAuthStatusMessage,
  SDKCompactBoundaryMessage,
  SDKControlRequest,
  SDKControlResponse,
  SDKElicitationCompleteMessage,
  SDKFilesPersistedEvent,
  SDKHookProgressMessage,
  SDKHookResponseMessage,
  SDKHookStartedMessage,
  SDKLocalCommandOutputMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKPromptSuggestionMessage,
  SDKRateLimitEvent,
  SDKResultError,
  SDKResultMessage,
  SDKResultSuccess,
  SDKSessionStateChangedMessage,
  SDKStatusMessage,
  SDKSystemMessage,
  SDKTaskNotificationMessage,
  SDKTaskProgressMessage,
  SDKTaskStartedMessage,
  SDKToolProgressMessage,
  SDKToolUseSummaryMessage,
  SDKUserMessage,
  SDKUserMessageReplay,
} from "@anthropic-ai/claude-agent-sdk";
export type { AxonEventListener, AxonEventView, BaseConnectionOptions } from "../shared/types.js";
export {
  ClaudeAxonConnection,
  type ClaudeAxonConnectionOptions,
  type ControlRequestHandler,
  type ControlRequestInner,
  type ControlRequestOfSubtype,
} from "./connection.js";
export {
  AxonTransport,
  type AxonTransportOptions,
  type Transport,
} from "./transport.js";
export type { WireData } from "./types.js";
