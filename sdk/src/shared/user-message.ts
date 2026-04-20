/**
 * Helpers for extracting user message content from timeline events.
 *
 * These encapsulate the protocol-specific payload parsing so that
 * consumers don't need to manually navigate JSON-RPC envelopes or
 * SDK message structures.
 */

import type { ContentBlock } from "@agentclientprotocol/sdk";
import { isFromUser } from "./origin-guards.js";
import type { AxonEventView } from "./types.js";

// ---------------------------------------------------------------------------
// ACP
// ---------------------------------------------------------------------------

/**
 * A user message extracted from an ACP timeline event.
 *
 * @category Timeline
 */
export interface ExtractedACPUserMessage {
  /**
   * Concatenated text from all `text` content blocks (convenience).
   * Non-text blocks (images, files, etc.) are not included here —
   * inspect {@link content} for the full set of blocks.
   */
  text: string;
  /** The full array of ACP content blocks from the prompt, including non-text blocks. */
  content: ContentBlock[];
  /** The Axon event sequence number (useful as a stable ID). */
  sequence: number;
}

/**
 * Extracts user message content from an ACP protocol timeline event.
 *
 * Returns the extracted content when the event represents a user-sent
 * prompt (`session/prompt` with `origin: "USER_EVENT"`).
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
): ExtractedACPUserMessage | null {
  if (!isFromUser(axonEvent)) return null;
  if (axonEvent.event_type !== "session/prompt") return null;

  if (data == null || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  const prompt = obj.prompt;

  if (!Array.isArray(prompt)) return null;

  let text = "";
  const content: ContentBlock[] = [];
  for (const block of prompt) {
    if (block != null && typeof block === "object" && "type" in block) {
      content.push(block as ContentBlock);
      if (block.type === "text" && "text" in block && typeof block.text === "string") {
        text += block.text;
      }
    }
  }

  return { text, content, sequence: axonEvent.sequence };
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

/**
 * A user message extracted from a Claude timeline event.
 *
 * The `content` array contains the raw content blocks from the
 * `MessageParam.content` field. When `@anthropic-ai/sdk` is installed,
 * each element is a `ContentBlockParam`.
 *
 * @category Timeline
 */
export interface ExtractedClaudeUserMessage {
  /**
   * Concatenated text from all `text` content blocks (convenience).
   * Non-text blocks (images, tool results, etc.) are not included here —
   * inspect {@link content} for the full set of blocks.
   */
  text: string;
  /** The full array of content blocks from the user message, including non-text blocks. */
  content: unknown[];
  /** The Axon event sequence number (useful as a stable ID). */
  sequence: number;
}

/**
 * Extracts user message content from a Claude protocol timeline event.
 *
 * Returns the extracted content when the event represents a user-sent
 * message (`SDKUserMessage` with `type: "user"` and
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
): ExtractedClaudeUserMessage | null {
  if (!isFromUser(axonEvent)) return null;

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
  const content: unknown[] = [];

  if (typeof rawContent === "string") {
    text = rawContent;
    content.push({ type: "text", text: rawContent });
  } else if (Array.isArray(rawContent)) {
    for (const block of rawContent) {
      if (block != null && typeof block === "object") {
        content.push(block);
        if (
          "type" in block &&
          block.type === "text" &&
          "text" in block &&
          typeof block.text === "string"
        ) {
          text += block.text;
        }
      }
    }
  }

  return { text, content, sequence: axonEvent.sequence };
}

// ---------------------------------------------------------------------------
// Backward-compatible alias
// ---------------------------------------------------------------------------

/**
 * @deprecated Use {@link ExtractedACPUserMessage} or {@link ExtractedClaudeUserMessage} instead.
 */
export type ExtractedUserMessage = ExtractedACPUserMessage | ExtractedClaudeUserMessage;
