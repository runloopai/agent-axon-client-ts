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

/**
 * Type guard for text content blocks.
 *
 * @param block - The content block to test.
 * @returns `true` if `block` is a text content block.
 * @category Content Blocks
 */
export function isTextContent(block: ContentBlock): block is TextContent & { type: "text" } {
  return block.type === "text";
}

/**
 * Type guard for image content blocks.
 *
 * @param block - The content block to test.
 * @returns `true` if `block` is an image content block.
 * @category Content Blocks
 */
export function isImageContent(block: ContentBlock): block is ImageContent & { type: "image" } {
  return block.type === "image";
}

/**
 * Type guard for audio content blocks.
 *
 * @param block - The content block to test.
 * @returns `true` if `block` is an audio content block.
 * @category Content Blocks
 */
export function isAudioContent(block: ContentBlock): block is AudioContent & { type: "audio" } {
  return block.type === "audio";
}

/**
 * Type guard for resource link content blocks.
 *
 * @param block - The content block to test.
 * @returns `true` if `block` is a resource link content block.
 * @category Content Blocks
 */
export function isResourceLinkContent(
  block: ContentBlock,
): block is ResourceLink & { type: "resource_link" } {
  return block.type === "resource_link";
}

/**
 * Type guard for embedded resource content blocks.
 *
 * @param block - The content block to test.
 * @returns `true` if `block` is an embedded resource content block.
 * @category Content Blocks
 */
export function isEmbeddedResourceContent(
  block: ContentBlock,
): block is EmbeddedResource & { type: "resource" } {
  return block.type === "resource";
}
