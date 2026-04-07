/**
 * Types for the Claude SDK transport layer.
 */

/**
 * Raw JSON data from the transport layer.
 * @category Transport
 */
// biome-ignore lint/suspicious/noExplicitAny: wire data is untyped JSON from the transport layer
export type WireData = Record<string, any>;
