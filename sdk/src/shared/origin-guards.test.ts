import { describe, expect, it } from "vitest";
import { isFromAgent, isFromUser } from "./origin-guards.js";

function makeAxonEvent(origin: string) {
  return { origin, event_type: "test", sequence: 0 } as never;
}

function makeTimelineEvent(origin: string) {
  return {
    kind: "system",
    data: null,
    axonEvent: { origin, event_type: "test", sequence: 0 },
  } as never;
}

describe("isFromAgent", () => {
  it("returns true for an AxonEventView with origin AGENT_EVENT", () => {
    expect(isFromAgent(makeAxonEvent("AGENT_EVENT"))).toBe(true);
  });

  it("returns false for an AxonEventView with origin USER_EVENT", () => {
    expect(isFromAgent(makeAxonEvent("USER_EVENT"))).toBe(false);
  });

  it("returns true for a timeline event with origin AGENT_EVENT", () => {
    expect(isFromAgent(makeTimelineEvent("AGENT_EVENT"))).toBe(true);
  });

  it("returns false for a timeline event with origin USER_EVENT", () => {
    expect(isFromAgent(makeTimelineEvent("USER_EVENT"))).toBe(false);
  });

  it("returns false for an unknown origin string", () => {
    expect(isFromAgent(makeAxonEvent("SYSTEM_EVENT"))).toBe(false);
  });
});

describe("isFromUser", () => {
  it("returns true for an AxonEventView with origin USER_EVENT", () => {
    expect(isFromUser(makeAxonEvent("USER_EVENT"))).toBe(true);
  });

  it("returns false for an AxonEventView with origin AGENT_EVENT", () => {
    expect(isFromUser(makeAxonEvent("AGENT_EVENT"))).toBe(false);
  });

  it("returns true for a timeline event with origin USER_EVENT", () => {
    expect(isFromUser(makeTimelineEvent("USER_EVENT"))).toBe(true);
  });

  it("returns false for a timeline event with origin AGENT_EVENT", () => {
    expect(isFromUser(makeTimelineEvent("AGENT_EVENT"))).toBe(false);
  });

  it("returns false for an unknown origin string", () => {
    expect(isFromUser(makeAxonEvent("SYSTEM_EVENT"))).toBe(false);
  });
});
