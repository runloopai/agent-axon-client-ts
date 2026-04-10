import type { AxonEventView } from "@runloop/api-client/resources/axons";
import type { Axon } from "@runloop/api-client/sdk";

/**
 * Extracts the internal Runloop client from an `Axon` instance.
 * The `client` field is private in TypeScript but present at runtime.
 */
function getAxonClient(axon: Axon): {
  axons: {
    events: {
      list: (
        id: string,
        query?: { limit?: number; include_total_count?: boolean },
      ) => Promise<{ events: AxonEventView[]; total_count?: number | null }>;
    };
  };
} {
  return (axon as unknown as { client: ReturnType<typeof getAxonClient> }).client;
}

/**
 * Returns the sequence number of the most recent event on the axon,
 * or `undefined` if the axon has no events.
 *
 * Calls `GET /v1/axons/{id}/events?limit=1` which returns events ordered
 * by sequence descending. The first event's sequence is the head.
 */
export async function getLastSequence(axon: Axon): Promise<number | undefined> {
  const client = getAxonClient(axon);
  const result = await client.axons.events.list(axon.id, {
    limit: 1,
    include_total_count: false,
  });
  if (result.events.length === 0) return undefined;
  return result.events[0].sequence;
}
