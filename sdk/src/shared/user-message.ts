/**
 * Helpers for extracting user message text from timeline events.
 *
 * These encapsulate the protocol-specific payload parsing so that
 * consumers don't need to manually navigate JSON-RPC envelopes or
 * SDK message structures.
 */

import type { AxonEventView } from "./types.js";

/**
 * A user message extracted from a timeline event.
 *
 * @category Timeline
 */
export interface ExtractedUserMessage {
  /** The plain-text content of the user's message. */
  text: string;
  /** The Axon event sequence number (useful as a stable ID). */
  sequence: number;
}

/**
 * Extracts user message text from a Claude protocol timeline event.
 *
 * Returns the extracted text and sequence number when the event represents
 * a user-sent message (`SDKUserMessage` with `type: "user"` and
 * `origin: "USER_EVENT"`). Returns `null` for all other events.
 *
 * Handles both `string` and `Array<ContentBlockParam>` forms of
 * `MessageParam.content`.
 *
 * @category Timeline
 */
export function extractClaudeUserMessage(
  data: unknown,
  axonEvent: AxonEventView,
): ExtractedUserMessage | null {
  if (axonEvent.origin !== "USER_EVENT") return null;

  if (
    data == null ||
    typeof data !== "object" ||
    !("type" in data) ||
    (data as { type: unknown }).type !== "user"
  ) {
    return null;
  }

  const msg = data as { message?: { content?: unknown } };
  const rawContent = msg.message?.content;
  let text = "";

  if (typeof rawContent === "string") {
    text = rawContent;
  } else if (Array.isArray(rawContent)) {
    for (const block of rawContent) {
      if (
        block != null &&
        typeof block === "object" &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        text += block.text;
      }
    }
  }

  return { text, sequence: axonEvent.sequence };
}

/**
 * Extracts user message text from an ACP protocol timeline event.
 *
 * Returns the extracted text and sequence number when the event represents
 * a user-sent prompt (`session/prompt` with `origin: "USER_EVENT"`).
 * Returns `null` for all other events.
 *
 * Expects the parsed payload produced by {@link classifyACPAxonEvent},
 * where `data` is the params-level object (`{ prompt, sessionId }`).
 *
 * @category Timeline
 */
export function extractACPUserMessage(
  data: unknown,
  axonEvent: AxonEventView,
): ExtractedUserMessage | null {
  if (axonEvent.origin !== "USER_EVENT") return null;
  if (axonEvent.event_type !== "session/prompt") return null;

  if (data == null || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  const prompt = obj.prompt;

  if (!Array.isArray(prompt)) return null;

  let text = "";
  for (const block of prompt) {
    if (
      block != null &&
      typeof block === "object" &&
      "type" in block &&
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string"
    ) {
      text += block.text;
    }
  }

  return { text, sequence: axonEvent.sequence };
}
