import { tryParseTimelinePayload, isUnknownTimelineEvent } from "@runloop/agent-axon-client/acp";
import type { TimelineEvent, AgentConfigItem, AgentStartedPayload, UserAttachment } from "../types.js";

/**
 * Returns `true` when the timeline event is a custom `agent_started` event
 * (not part of any protocol, classified as `unknown` by the SDK).
 */
export function isAgentStartedEvent(
  event: TimelineEvent,
): boolean {
  return isUnknownTimelineEvent(event) && event.axonEvent.event_type === "agent_started";
}

/**
 * Builds an {@link AgentConfigItem} from an `agent_started` timeline event.
 * Returns `null` if the event is not an `agent_started` event.
 */
export function buildAgentConfigItem(event: TimelineEvent): AgentConfigItem | null {
  if (!isAgentStartedEvent(event)) return null;
  const parsed = tryParseTimelinePayload<AgentStartedPayload>({ axonEvent: event.axonEvent });
  if (!parsed || typeof parsed !== "object" || typeof parsed.agentType !== "string" || typeof parsed.agentId !== "string") {
    return null;
  }
  const config: AgentStartedPayload = parsed;
  return {
    id: `config-${event.axonEvent.sequence}`,
    role: "system",
    itemType: "agent_started",
    config,
  };
}

/**
 * Extracts image attachments from Claude user message content blocks.
 *
 * Handles two shapes:
 * - Anthropic-style: `{ type: "image", source: { type: "base64", media_type, data } }`
 * - Flat-style: `{ type: "image", data, mimeType }`
 */
export function extractImageAttachments(content: unknown[]): UserAttachment[] {
  const attachments: UserAttachment[] = [];
  for (const block of content) {
    if (block == null || typeof block !== "object" || !("type" in block)) continue;
    const b = block as Record<string, unknown>;
    if (b.type !== "image") continue;

    const src = b.source as Record<string, unknown> | undefined;
    if (src?.type === "base64" && typeof src.data === "string" && typeof src.media_type === "string") {
      attachments.push({ type: "image", data: src.data, mimeType: src.media_type });
    } else if (typeof b.data === "string" && typeof b.mimeType === "string") {
      attachments.push({ type: "image", data: b.data, mimeType: b.mimeType });
    }
  }
  return attachments;
}
