import type { AxonEventView } from "@runloop/api-client/resources/axons";
import { describe, expect, it } from "vitest";
import { parseTimelinePayload, tryParseSystemEvent } from "./timeline.js";

function makeAxonEvent(overrides: Partial<AxonEventView> = {}): AxonEventView {
  return {
    axon_id: "axn_test",
    event_type: "turn.started",
    origin: "SYSTEM_EVENT",
    payload: "{}",
    sequence: 1,
    source: "test",
    timestamp_ms: Date.now(),
    ...overrides,
  };
}

describe("parseTimelinePayload", () => {
  it("parses a JSON string payload", () => {
    const ev = makeAxonEvent({ payload: '{"key":"value"}' });
    expect(parseTimelinePayload({ axonEvent: ev })).toEqual({ key: "value" });
  });

  it("returns the payload as-is when it is already an object", () => {
    const ev = makeAxonEvent({ payload: { key: "value" } as unknown as string });
    expect(parseTimelinePayload({ axonEvent: ev })).toEqual({ key: "value" });
  });

  it("returns null for invalid JSON", () => {
    const ev = makeAxonEvent({ payload: "not json" });
    expect(parseTimelinePayload({ axonEvent: ev })).toBeNull();
  });

  it("returns null for undefined payload", () => {
    const ev = makeAxonEvent({ payload: undefined as unknown as string });
    expect(parseTimelinePayload({ axonEvent: ev })).toBeNull();
  });
});

describe("tryParseSystemEvent", () => {
  it("parses turn.started", () => {
    const ev = makeAxonEvent({
      event_type: "turn.started",
      payload: JSON.stringify({ turn_id: "t-1" }),
    });
    expect(tryParseSystemEvent(ev)).toEqual({ type: "turn.started", turnId: "t-1" });
  });

  it("parses turn.completed with stopReason", () => {
    const ev = makeAxonEvent({
      event_type: "turn.completed",
      payload: JSON.stringify({ turn_id: "t-2", stop_reason: "end_turn" }),
    });
    expect(tryParseSystemEvent(ev)).toEqual({
      type: "turn.completed",
      turnId: "t-2",
      stopReason: "end_turn",
    });
  });

  it("parses turn.completed without stopReason", () => {
    const ev = makeAxonEvent({
      event_type: "turn.completed",
      payload: JSON.stringify({ turn_id: "t-3" }),
    });
    expect(tryParseSystemEvent(ev)).toEqual({
      type: "turn.completed",
      turnId: "t-3",
      stopReason: undefined,
    });
  });

  it("parses broker.error with message field", () => {
    const ev = makeAxonEvent({
      event_type: "broker.error",
      payload: JSON.stringify({ message: "something went wrong" }),
    });
    expect(tryParseSystemEvent(ev)).toEqual({
      type: "broker.error",
      message: "something went wrong",
    });
  });

  it("parses broker.error falling back to stringified payload", () => {
    const ev = makeAxonEvent({
      event_type: "broker.error",
      payload: "raw error string",
    });
    expect(tryParseSystemEvent(ev)).toEqual({
      type: "broker.error",
      message: "raw error string",
    });
  });

  it("returns null for invalid JSON on turn events", () => {
    const ev = makeAxonEvent({
      event_type: "turn.started",
      payload: "not json",
    });
    expect(tryParseSystemEvent(ev)).toBeNull();
  });

  it("returns null for unrecognized event_type", () => {
    const ev = makeAxonEvent({ event_type: "custom.event" });
    expect(tryParseSystemEvent(ev)).toBeNull();
  });
});
