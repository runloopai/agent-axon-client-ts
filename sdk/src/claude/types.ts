/**
 * Types for the Claude SDK transport layer.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { SystemTimelineEvent, UnrecognizedTimelineEvent } from "../shared/types.js";

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
 * A timeline event carrying a recognized Claude protocol event.
 * `data` is the parsed `SDKMessage` from the Claude Code CLI.
 *
 * Use `axonEvent.origin` to determine direction:
 * - `USER_EVENT` = outbound (client sent this)
 * - `AGENT_EVENT` = inbound (agent sent this)
 *
 * @category Timeline
 */
export interface ClaudeProtocolTimelineEvent {
  kind: "claude_protocol";
  data: SDKMessage;
  axonEvent: AxonEventView;
}

/**
 * Union of all timeline event types emitted by the Claude connection.
 * @category Timeline
 */
export type ClaudeTimelineEvent =
  | ClaudeProtocolTimelineEvent
  | SystemTimelineEvent
  | UnrecognizedTimelineEvent;
