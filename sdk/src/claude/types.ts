/**
 * Shared types for the Claude SDK transport and connection layers.
 */

// biome-ignore lint/suspicious/noExplicitAny: wire data is untyped JSON from the transport layer
export type WireData = Record<string, any>;
