import { describe, expect, it, vi } from "vitest";
import { getLastSequence } from "./replay.js";

function makeMockAxon(totalCount: number | null | undefined) {
  return {
    id: "axn_test",
    client: {
      get: vi.fn().mockResolvedValue({
        events: [],
        has_more: false,
        total_count: totalCount,
      }),
    },
  };
}

describe("getLastSequence", () => {
  it("returns total_count when present", async () => {
    const axon = makeMockAxon(99);
    const result = await getLastSequence(axon as never);
    expect(result).toBe(99);
    expect(axon.client.get).toHaveBeenCalledWith("/v1/axons/axn_test/events", {
      query: { limit: 1, include_total_count: true },
    });
  });

  it("returns undefined when total_count is null", async () => {
    const axon = makeMockAxon(null);
    const result = await getLastSequence(axon as never);
    expect(result).toBeUndefined();
  });

  it("returns undefined when total_count is undefined", async () => {
    const axon = makeMockAxon(undefined);
    const result = await getLastSequence(axon as never);
    expect(result).toBeUndefined();
  });

  it("returns 0 when total_count is 0", async () => {
    const axon = makeMockAxon(0);
    const result = await getLastSequence(axon as never);
    expect(result).toBe(0);
  });
});
