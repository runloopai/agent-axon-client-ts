/**
 * Shared types for the Claude SDK transport and connection layers.
 */

import type { AxonEventView } from "@runloop/api-client/resources/axons";

/**
 * Raw JSON data from the transport layer.
 * @category Transport
 */
// biome-ignore lint/suspicious/noExplicitAny: wire data is untyped JSON from the transport layer
export type WireData = Record<string, any>;

/**
 * Callback invoked for every Axon event (before origin filtering).
 *
 * @param event - The raw {@link AxonEventView} from the Axon SSE feed,
 *   including events from all origins (agent, user, system).
 *
 * @category Configuration
 */
export type AxonEventListener = (event: AxonEventView) => void;
