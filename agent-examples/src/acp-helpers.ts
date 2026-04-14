import {
  type ACPTimelineEvent,
  type ACPSessionUpdateTimelineEvent,
  isAgentMessageChunk,
} from "@runloop/agent-axon-client/acp";

function isSessionUpdateEvent(
  event: ACPTimelineEvent,
): event is ACPSessionUpdateTimelineEvent {
  return event.kind === "acp_protocol" && event.eventType === "session/update";
}

/**
 * Extracts agent message text from an ACPTimelineEvent if the event is a
 * `session/update` containing an agent message chunk with text content.
 *
 * @returns The text content, or `null` if the event is not an agent text chunk.
 */
export function extractAgentText(event: ACPTimelineEvent): string | null {
  if (!isSessionUpdateEvent(event)) {
    return null;
  }
  const update = event.data.update;
  if (!isAgentMessageChunk(update)) {
    return null;
  }
  if (update.content.type === "text" && update.content.text) {
    return update.content.text;
  }
  return null;
}
