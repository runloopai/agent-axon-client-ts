import type { Axon, Runloop } from "@runloop/api-client/sdk";

interface AxonEventListResponse {
  events: unknown[];
  has_more: boolean;
  total_count?: number | null;
}

/**
 * Extracts the internal Runloop client from an `Axon` instance.
 * The `client` field is private in TypeScript but present at runtime.
 */
function getAxonClient(axon: Axon): Runloop {
  return (axon as unknown as { client: Runloop }).client;
}

/**
 * Returns the sequence number of the most recent event on the axon,
 * or `undefined` if the axon has no events.
 *
 * Calls `GET /v1/axons/{id}/events?limit=1&include_total_count=true`
 * directly because `@runloop/api-client` does not yet expose a typed
 * `listEvents` or `getHead` method on the `Axon` resource. The private
 * `client` field is accessed via cast — fragile but functional.
 *
 * Axon sequences are 1-based and monotonically increasing, so
 * `total_count` equals the highest sequence number.
 *
 * @todo Replace with a proper SDK method once `@runloop/api-client`
 *   adds `Axon.listEvents()` or equivalent (tracked upstream).
 */
export async function getLastSequence(axon: Axon): Promise<number | undefined> {
  const client = getAxonClient(axon);
  const result = await client.get<Record<string, unknown>, AxonEventListResponse>(
    `/v1/axons/${axon.id}/events`,
    {
      query: { limit: 1, include_total_count: true },
    },
  );
  return result.total_count ?? undefined;
}
