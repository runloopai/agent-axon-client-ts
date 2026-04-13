import { describe, expect, it, vi } from "vitest";
import { resolveReplayTarget } from "./connect-guards.js";

function makeMockAxon(totalCount: number | null) {
  return {
    id: "axn_test",
    client: {
      get: vi.fn().mockResolvedValue({ events: [], has_more: false, total_count: totalCount }),
    },
  };
}

describe("resolveReplayTarget", () => {
  const log = vi.fn();

  it("returns the last sequence when replay is true (default)", async () => {
    const axon = makeMockAxon(42);
    const result = await resolveReplayTarget(axon as never, {}, log);
    expect(result).toBe(42);
    expect(log).toHaveBeenCalledWith("connect", "replay target sequence: 42");
  });

  it("returns undefined when replay is explicitly false", async () => {
    const axon = makeMockAxon(42);
    const result = await resolveReplayTarget(axon as never, { replay: false }, log);
    expect(result).toBeUndefined();
  });

  it("throws when both replay and afterSequence are set", async () => {
    const axon = makeMockAxon(10);
    await expect(
      resolveReplayTarget(axon as never, { replay: true, afterSequence: 5 }, log),
    ).rejects.toThrow("Cannot use both 'replay' and 'afterSequence'");
  });

  it("returns undefined when axon has no events (total_count is null)", async () => {
    const axon = makeMockAxon(null);
    const result = await resolveReplayTarget(axon as never, {}, log);
    expect(result).toBeUndefined();
  });

  it("treats replay as true by default", async () => {
    const axon = makeMockAxon(7);
    const result = await resolveReplayTarget(axon as never, {}, log);
    expect(result).toBe(7);
  });
});
