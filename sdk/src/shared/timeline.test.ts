import { describe, expect, it, vi } from "vitest";
import { makeFullAxonEvent as makeAxonEvent } from "../__test-utils__/mock-axon.js";
import { createClassifier, tryParseSystemEvent, tryParseTimelinePayload } from "./timeline.js";

describe("tryParseTimelinePayload", () => {
  it("parses a JSON string payload", () => {
    const ev = makeAxonEvent({ payload: '{"key":"value"}' });
    expect(tryParseTimelinePayload({ axonEvent: ev })).toEqual({ key: "value" });
  });

  it("returns the payload as-is when it is already an object", () => {
    const ev = makeAxonEvent({ payload: { key: "value" } as unknown as string });
    expect(tryParseTimelinePayload({ axonEvent: ev })).toEqual({ key: "value" });
  });

  it("returns null for invalid JSON and logs a warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ev = makeAxonEvent({
      payload: "not json",
      event_type: "custom.bad",
      sequence: 99,
    });
    expect(tryParseTimelinePayload({ axonEvent: ev })).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("custom.bad");
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("sequence=99");
    warnSpy.mockRestore();
  });

  it("returns null for undefined payload", () => {
    const ev = makeAxonEvent({ payload: undefined as unknown as string });
    expect(tryParseTimelinePayload({ axonEvent: ev })).toBeNull();
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

  it("parses broker.error with JSON object missing message key", () => {
    const ev = makeAxonEvent({
      event_type: "broker.error",
      payload: JSON.stringify({ code: 500 }),
    });
    const result = tryParseSystemEvent(ev);
    expect(result).toEqual({
      type: "broker.error",
      message: JSON.stringify({ code: 500 }),
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

describe("createClassifier", () => {
  const classify = createClassifier<{ kind: "test"; data: unknown; axonEvent: unknown }>({
    label: "testClassifier",
    isProtocolEventType: (t) => t.startsWith("test."),
    toProtocolEvent: (data, ev) => ({ kind: "test", data, axonEvent: ev }),
  });

  it("classifies SYSTEM_EVENT origin as system timeline events", () => {
    const ev = makeAxonEvent({
      origin: "SYSTEM_EVENT",
      event_type: "turn.started",
      payload: JSON.stringify({ turn_id: "t-1" }),
    });
    const result = classify(ev);
    expect(result.kind).toBe("system");
  });

  it("classifies known protocol event types as protocol events", () => {
    const ev = makeAxonEvent({
      origin: "AGENT_EVENT",
      event_type: "test.foo",
      payload: JSON.stringify({ bar: 1 }),
    });
    const result = classify(ev);
    expect(result.kind).toBe("test");
    expect(result.data).toEqual({ bar: 1 });
  });

  it("classifies unknown event types as unknown", () => {
    const ev = makeAxonEvent({
      origin: "AGENT_EVENT",
      event_type: "other.event",
      payload: "{}",
    });
    const result = classify(ev);
    expect(result.kind).toBe("unknown");
  });

  it("routes parse errors to onError callback instead of console.warn", () => {
    const onError = vi.fn();
    const classifyWithHandler = createClassifier({
      label: "errTest",
      isProtocolEventType: (t) => t === "bad.json",
      toProtocolEvent: () => null,
      onError,
    });

    const ev = makeAxonEvent({
      origin: "AGENT_EVENT",
      event_type: "bad.json",
      payload: "not valid json",
    });
    classifyWithHandler(ev);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toContain("[errTest] Failed to parse payload");
  });

  it("handles non-string payload as-is", () => {
    const ev = makeAxonEvent({
      origin: "AGENT_EVENT",
      event_type: "test.obj",
      payload: { nested: true } as unknown as string,
    });
    const result = classify(ev);
    expect(result.kind).toBe("test");
    expect(result.data).toEqual({ nested: true });
  });
});
