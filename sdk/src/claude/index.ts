/**
 * Claude module for connecting to Claude Code instances running inside
 * Runloop devboxes via the Axon event bus.
 *
 * **Getting started:** Create a {@link ClaudeAxonConnection} with an
 * Axon channel and devbox ID, call
 * {@link ClaudeAxonConnection.initialize | initialize()}, then use
 * {@link ClaudeAxonConnection.send | send()} and
 * {@link ClaudeAxonConnection.receiveResponse | receiveResponse()} to
 * interact with Claude Code.
 *
 * @categoryDescription Connection
 * The main connection class for interacting with Claude Code.
 *
 * @categoryDescription Configuration
 * Options and handler types used when creating and configuring a connection.
 *
 * @categoryDescription Transport
 * Low-level transport layer that bridges Axon SSE streams and the Claude
 * wire protocol. Most users won't need this directly.
 *
 * @module
 */

export type { AxonEventView } from "@runloop/api-client/resources/axons";
export {
  ClaudeAxonConnection,
  type ClaudeAxonConnectionOptions,
  type ControlRequestHandler,
} from "./connection.js";
export { AxonTransport, type AxonTransportOptions, type Transport } from "./transport.js";
export type { AxonEventListener, WireData } from "./types.js";
