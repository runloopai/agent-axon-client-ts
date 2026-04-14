/**
 * Type guards for narrowing {@link ContentBlock} to specific variants.
 *
 * Use these to discriminate the content block union in session update handlers
 * when processing `agent_message_chunk`, `agent_thought_chunk`, or
 * `user_message_chunk` updates.
 *
 * @example
 * ```typescript
 * conn.onSessionUpdate((sessionId, update) => {
 *   if (isAgentMessageChunk(update)) {
 *     if (isTextContent(update.content)) {
 *       console.log(update.content.text);
 *     }
 *     if (isImageContent(update.content)) {
 *       console.log("Got image:", update.content.data);
 *     }
 *   }
 * });
 * ```
 *
 * @module
 */

import type {
  AudioContent,
  ContentBlock,
  EmbeddedResource,
  ImageContent,
  ResourceLink,
  TextContent,
} from "@agentclientprotocol/sdk";

// ---------------------------------------------------------------------------
// Narrowed types
// ---------------------------------------------------------------------------

/**
 * A text content block.
 * @category Content Blocks
 */
export type TextContentBlock = TextContent & { type: "text" };

/**
 * An image content block.
 * @category Content Blocks
 */
export type ImageContentBlock = ImageContent & { type: "image" };

/**
 * An audio content block.
 * @category Content Blocks
 */
export type AudioContentBlock = AudioContent & { type: "audio" };

/**
 * A resource link content block.
 * @category Content Blocks
 */
export type ResourceLinkContentBlock = ResourceLink & { type: "resource_link" };

/**
 * An embedded resource content block.
 * @category Content Blocks
 */
export type EmbeddedResourceContentBlock = EmbeddedResource & { type: "resource" };

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Type guard for text content blocks.
 *
 * @param block - The content block to test.
 * @returns `true` if `block` is a {@link TextContentBlock}.
 * @category Content Blocks
 */
export function isTextContent(block: ContentBlock): block is TextContentBlock {
  return block.type === "text";
}

/**
 * Type guard for image content blocks.
 *
 * @param block - The content block to test.
 * @returns `true` if `block` is an {@link ImageContentBlock}.
 * @category Content Blocks
 */
export function isImageContent(block: ContentBlock): block is ImageContentBlock {
  return block.type === "image";
}

/**
 * Type guard for audio content blocks.
 *
 * @param block - The content block to test.
 * @returns `true` if `block` is an {@link AudioContentBlock}.
 * @category Content Blocks
 */
export function isAudioContent(block: ContentBlock): block is AudioContentBlock {
  return block.type === "audio";
}

/**
 * Type guard for resource link content blocks.
 *
 * @param block - The content block to test.
 * @returns `true` if `block` is a {@link ResourceLinkContentBlock}.
 * @category Content Blocks
 */
export function isResourceLinkContent(block: ContentBlock): block is ResourceLinkContentBlock {
  return block.type === "resource_link";
}

/**
 * Type guard for embedded resource content blocks.
 *
 * @param block - The content block to test.
 * @returns `true` if `block` is an {@link EmbeddedResourceContentBlock}.
 * @category Content Blocks
 */
export function isEmbeddedResourceContent(
  block: ContentBlock,
): block is EmbeddedResourceContentBlock {
  return block.type === "resource";
}
