import { CLIENT_METHODS } from "@agentclientprotocol/sdk";
import type { AxonEventView } from "@runloop/api-client/resources/axons";
import { describe, expect, it } from "vitest";
import {
  isElicitationCompleteEvent,
  isElicitationRequestEvent,
  isElicitationResponseEvent,
} from "./client-event-guards.js";
import type { ACPTimelineEvent } from "./types.js";

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeAxonEvent(eventType: string, origin: "AGENT_EVENT" | "USER_EVENT"): AxonEventView {
  return {
    axon_id: "axn_test",
    event_type: eventType,
    origin,
    payload: JSON.stringify({ test: true }),
    sequence: 1,
    source: "test",
    timestamp_ms: Date.now(),
  };
}

function makeProtocolTimelineEvent(
  eventType: string,
  origin: "AGENT_EVENT" | "USER_EVENT",
): ACPTimelineEvent {
  return {
    kind: "acp_protocol",
    eventType,
    data: { test: true },
    axonEvent: makeAxonEvent(eventType, origin),
  };
}

function makeSystemTimelineEvent(): ACPTimelineEvent {
  return {
    kind: "system",
    data: { type: "turn.started", turnId: "t-1" },
    axonEvent: makeAxonEvent("turn.started", "AGENT_EVENT"),
  };
}

function makeUnknownTimelineEvent(): ACPTimelineEvent {
  return {
    kind: "unknown",
    data: null,
    axonEvent: makeAxonEvent("custom/unknown", "AGENT_EVENT"),
  };
}

// ---------------------------------------------------------------------------
// isElicitationRequestEvent
// ---------------------------------------------------------------------------

describe("isElicitationRequestEvent", () => {
  it("returns true for session/elicitation AGENT_EVENT", () => {
    const event = makeProtocolTimelineEvent(CLIENT_METHODS.session_elicitation, "AGENT_EVENT");
    expect(isElicitationRequestEvent(event)).toBe(true);
  });

  it("returns false for session/elicitation USER_EVENT (response)", () => {
    const event = makeProtocolTimelineEvent(CLIENT_METHODS.session_elicitation, "USER_EVENT");
    expect(isElicitationRequestEvent(event)).toBe(false);
  });

  it("returns false for other protocol events", () => {
    const event = makeProtocolTimelineEvent("session/update", "AGENT_EVENT");
    expect(isElicitationRequestEvent(event)).toBe(false);
  });

  it("returns false for system events", () => {
    const event = makeSystemTimelineEvent();
    expect(isElicitationRequestEvent(event)).toBe(false);
  });

  it("returns false for unknown events", () => {
    const event = makeUnknownTimelineEvent();
    expect(isElicitationRequestEvent(event)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isElicitationResponseEvent
// ---------------------------------------------------------------------------

describe("isElicitationResponseEvent", () => {
  it("returns true for session/elicitation USER_EVENT", () => {
    const event = makeProtocolTimelineEvent(CLIENT_METHODS.session_elicitation, "USER_EVENT");
    expect(isElicitationResponseEvent(event)).toBe(true);
  });

  it("returns false for session/elicitation AGENT_EVENT (request)", () => {
    const event = makeProtocolTimelineEvent(CLIENT_METHODS.session_elicitation, "AGENT_EVENT");
    expect(isElicitationResponseEvent(event)).toBe(false);
  });

  it("returns false for other protocol events", () => {
    const event = makeProtocolTimelineEvent("session/update", "USER_EVENT");
    expect(isElicitationResponseEvent(event)).toBe(false);
  });

  it("returns false for system events", () => {
    const event = makeSystemTimelineEvent();
    expect(isElicitationResponseEvent(event)).toBe(false);
  });

  it("returns false for unknown events", () => {
    const event = makeUnknownTimelineEvent();
    expect(isElicitationResponseEvent(event)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isElicitationCompleteEvent
// ---------------------------------------------------------------------------

describe("isElicitationCompleteEvent", () => {
  it("returns true for session/elicitation/complete AGENT_EVENT", () => {
    const event = makeProtocolTimelineEvent(
      CLIENT_METHODS.session_elicitation_complete,
      "AGENT_EVENT",
    );
    expect(isElicitationCompleteEvent(event)).toBe(true);
  });

  it("returns true for session/elicitation/complete USER_EVENT", () => {
    const event = makeProtocolTimelineEvent(
      CLIENT_METHODS.session_elicitation_complete,
      "USER_EVENT",
    );
    expect(isElicitationCompleteEvent(event)).toBe(true);
  });

  it("returns false for session/elicitation events", () => {
    const event = makeProtocolTimelineEvent(CLIENT_METHODS.session_elicitation, "AGENT_EVENT");
    expect(isElicitationCompleteEvent(event)).toBe(false);
  });

  it("returns false for other protocol events", () => {
    const event = makeProtocolTimelineEvent("session/update", "AGENT_EVENT");
    expect(isElicitationCompleteEvent(event)).toBe(false);
  });

  it("returns false for system events", () => {
    const event = makeSystemTimelineEvent();
    expect(isElicitationCompleteEvent(event)).toBe(false);
  });

  it("returns false for unknown events", () => {
    const event = makeUnknownTimelineEvent();
    expect(isElicitationCompleteEvent(event)).toBe(false);
  });
});
