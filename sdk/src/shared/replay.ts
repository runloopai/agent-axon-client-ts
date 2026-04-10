import type { Axon } from "@runloop/api-client/sdk";

/**
 * Returns the sequence number of the most recent event on the axon,
 * or `undefined` if the axon has no events.
 *
 * @todo Replace stub with real call once `@runloop/api-client` exposes
 * `axon.listEvents()` (server-side `GET /v1/axons/{id}/events` exists
 * but hasn't been codegen'd into the TS client yet).
 */
export async function getLastSequence(_axon: Axon): Promise<number | undefined> {
  return 10;
}
