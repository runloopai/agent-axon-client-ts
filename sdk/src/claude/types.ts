/**
 * Types for the Claude SDK transport layer.
 */

import type {
  SDKAssistantMessage,
  SDKControlRequest,
  SDKControlResponse,
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  BaseTimelineEvent,
  SystemTimelineEvent,
  UnknownTimelineEvent,
} from "../shared/types.js";

/**
 * Raw JSON data from the transport layer.
 * @category Transport
 */
// biome-ignore lint/suspicious/noExplicitAny: wire data is untyped JSON from the transport layer
export type WireData = Record<string, any>;

// ---------------------------------------------------------------------------
// Timeline events
// ---------------------------------------------------------------------------

/**
 * A user query timeline event.
 * @category Timeline
 */
export interface ClaudeQueryTimelineEvent extends BaseTimelineEvent {
  kind: "claude_protocol";
  eventType: "query";
  data: SDKUserMessage;
}

/**
 * An assistant message timeline event.
 * @category Timeline
 */
export interface ClaudeAssistantTimelineEvent extends BaseTimelineEvent {
  kind: "claude_protocol";
  eventType: "assistant";
  data: SDKAssistantMessage;
}

/**
 * A result (turn-complete) timeline event.
 * @category Timeline
 */
export interface ClaudeResultTimelineEvent extends BaseTimelineEvent {
  kind: "claude_protocol";
  eventType: "result";
  data: SDKResultMessage;
}

/**
 * A per-turn system/init timeline event emitted by the broker at the
 * start of each turn. Distinct from the one-time SDK-level `initialize`
 * control handshake (`control_request` / `control_response`).
 * @category Timeline
 */
export interface ClaudeSystemInitTimelineEvent extends BaseTimelineEvent {
  kind: "claude_protocol";
  eventType: "system";
  data: SDKSystemMessage;
}

/**
 * A control request timeline event (e.g. `initialize`, `can_use_tool`).
 * @category Timeline
 */
export interface ClaudeControlRequestTimelineEvent extends BaseTimelineEvent {
  kind: "claude_protocol";
  eventType: "control_request";
  data: SDKControlRequest;
}

/**
 * A control response timeline event.
 * @category Timeline
 */
export interface ClaudeControlResponseTimelineEvent extends BaseTimelineEvent {
  kind: "claude_protocol";
  eventType: "control_response";
  data: SDKControlResponse;
}

/**
 * A recognized Claude protocol event whose `eventType` is not one of the
 * specifically typed variants above.
 *
 * Use `axonEvent.origin` to determine direction:
 * - `USER_EVENT` = outbound (client sent this)
 * - `AGENT_EVENT` = inbound (agent sent this)
 *
 * @category Timeline
 */
export interface ClaudeOtherProtocolTimelineEvent extends BaseTimelineEvent {
  kind: "claude_protocol";
  eventType: string;
  data: SDKMessage;
}

/**
 * Discriminated union of all Claude protocol timeline event variants.
 * Switch on `eventType` to narrow the `data` type.
 * @category Timeline
 */
export type ClaudeProtocolTimelineEvent =
  | ClaudeQueryTimelineEvent
  | ClaudeAssistantTimelineEvent
  | ClaudeResultTimelineEvent
  | ClaudeSystemInitTimelineEvent
  | ClaudeControlRequestTimelineEvent
  | ClaudeControlResponseTimelineEvent
  | ClaudeOtherProtocolTimelineEvent;

/**
 * Union of all timeline event types emitted by the Claude connection.
 * @category Timeline
 */
export type ClaudeTimelineEvent =
  | ClaudeProtocolTimelineEvent
  | SystemTimelineEvent
  | UnknownTimelineEvent;
