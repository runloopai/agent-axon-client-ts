import {
  tryParseTimelinePayload,
  isUnknownTimelineEvent,
  isDevboxLifecycleEvent,
  isAgentErrorEvent,
} from "@runloop/agent-axon-client/acp";
import type { TimelineEvent, AgentConfigItem, AgentStartedPayload, SystemEventItem, UserAttachment } from "../types.js";

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

const DEVBOX_LIFECYCLE_LABELS: Record<string, string> = {
  running: "Devbox Running",
  suspended: "Devbox Suspended",
  shutdown: "Devbox Shutdown",
  failed: "Devbox Failed",
};

/**
 * Builds a {@link SystemEventItem} from a devbox lifecycle, agent error, or
 * broker error timeline event. Returns `null` for other event types.
 */
export function buildSystemEventItem(event: TimelineEvent): SystemEventItem | null {
  const ts = event.axonEvent.timestamp_ms ?? Date.now();

  if (isDevboxLifecycleEvent(event)) {
    const { kind, devboxId } = event.data;
    const reason = "reason" in event.data ? (event.data as { reason?: string }).reason : undefined;
    const label = DEVBOX_LIFECYCLE_LABELS[kind] ?? `Devbox ${kind}`;
    const detail = reason ? `${devboxId} — ${reason}` : devboxId;
    return {
      id: `sys-${event.axonEvent.sequence}`,
      role: "system",
      itemType: "system_event",
      eventKind: "devbox_lifecycle",
      label,
      detail,
      timestamp: ts,
    };
  }

  if (isAgentErrorEvent(event)) {
    const { devboxId, errorType, message } = event.data;
    const parts = [errorType, message].filter(Boolean);
    return {
      id: `sys-${event.axonEvent.sequence}`,
      role: "system",
      itemType: "system_event",
      eventKind: "agent_error",
      label: "Agent Error",
      detail: parts.length > 0 ? `${devboxId} — ${parts.join(": ")}` : devboxId,
      timestamp: ts,
    };
  }

  return null;
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
