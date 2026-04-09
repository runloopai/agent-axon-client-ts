import type { AxonEventView } from "@runloop/api-client/resources/axons";
import { describe, expect, it } from "vitest";
import { extractACPUserMessage, extractClaudeUserMessage } from "./user-message.js";

function makeAxonEvent(overrides: Partial<AxonEventView> = {}): AxonEventView {
  return {
    axon_id: "axn_test",
    event_type: "session/prompt",
    origin: "USER_EVENT",
    payload: "{}",
    sequence: 1,
    source: "test",
    timestamp_ms: Date.now(),
    ...overrides,
  };
}

describe("extractACPUserMessage", () => {
  it("extracts text from params-level payload (axonStream format)", () => {
    const data = {
      sessionId: "ses_123",
      prompt: [{ type: "text", text: "hello world" }],
    };
    const ev = makeAxonEvent();
    const result = extractACPUserMessage(data, ev);
    expect(result).toEqual({ text: "hello world", sequence: 1 });
  });

  it("extracts text from JSON-RPC envelope payload", () => {
    const data = {
      jsonrpc: "2.0",
      method: "session/prompt",
      params: {
        sessionId: "ses_123",
        prompt: [{ type: "text", text: "hello envelope" }],
      },
    };
    const ev = makeAxonEvent();
    const result = extractACPUserMessage(data, ev);
    expect(result).toEqual({ text: "hello envelope", sequence: 1 });
  });

  it("concatenates multiple text blocks", () => {
    const data = {
      prompt: [
        { type: "text", text: "first " },
        { type: "text", text: "second" },
      ],
    };
    const ev = makeAxonEvent();
    const result = extractACPUserMessage(data, ev);
    expect(result).toEqual({ text: "first second", sequence: 1 });
  });

  it("skips non-text blocks", () => {
    const data = {
      prompt: [
        { type: "image", data: "base64..." },
        { type: "text", text: "only this" },
      ],
    };
    const ev = makeAxonEvent();
    const result = extractACPUserMessage(data, ev);
    expect(result).toEqual({ text: "only this", sequence: 1 });
  });

  it("returns null for non-USER_EVENT origin", () => {
    const data = { prompt: [{ type: "text", text: "hi" }] };
    const ev = makeAxonEvent({ origin: "AGENT_EVENT" });
    expect(extractACPUserMessage(data, ev)).toBeNull();
  });

  it("returns null for wrong event_type", () => {
    const data = { prompt: [{ type: "text", text: "hi" }] };
    const ev = makeAxonEvent({ event_type: "session/update" });
    expect(extractACPUserMessage(data, ev)).toBeNull();
  });

  it("returns null for null data", () => {
    const ev = makeAxonEvent();
    expect(extractACPUserMessage(null, ev)).toBeNull();
  });

  it("returns null when prompt is missing", () => {
    const data = { sessionId: "ses_123" };
    const ev = makeAxonEvent();
    expect(extractACPUserMessage(data, ev)).toBeNull();
  });
});

describe("extractClaudeUserMessage", () => {
  it("extracts text from string content", () => {
    const data = { type: "user", message: { content: "hello claude" } };
    const ev = makeAxonEvent({ event_type: "query", origin: "USER_EVENT" });
    const result = extractClaudeUserMessage(data, ev);
    expect(result).toEqual({ text: "hello claude", sequence: 1 });
  });

  it("extracts text from array content", () => {
    const data = {
      type: "user",
      message: {
        content: [
          { type: "text", text: "part one " },
          { type: "text", text: "part two" },
        ],
      },
    };
    const ev = makeAxonEvent({ event_type: "query", origin: "USER_EVENT" });
    const result = extractClaudeUserMessage(data, ev);
    expect(result).toEqual({ text: "part one part two", sequence: 1 });
  });

  it("skips non-text blocks in array content", () => {
    const data = {
      type: "user",
      message: {
        content: [
          { type: "image", source: {} },
          { type: "text", text: "only text" },
        ],
      },
    };
    const ev = makeAxonEvent({ event_type: "query", origin: "USER_EVENT" });
    const result = extractClaudeUserMessage(data, ev);
    expect(result).toEqual({ text: "only text", sequence: 1 });
  });

  it("returns null for non-USER_EVENT origin", () => {
    const data = { type: "user", message: { content: "hi" } };
    const ev = makeAxonEvent({ event_type: "query", origin: "AGENT_EVENT" });
    expect(extractClaudeUserMessage(data, ev)).toBeNull();
  });

  it("returns null for non-user type", () => {
    const data = { type: "assistant", message: { content: "hi" } };
    const ev = makeAxonEvent({ event_type: "assistant", origin: "USER_EVENT" });
    expect(extractClaudeUserMessage(data, ev)).toBeNull();
  });

  it("returns null for null data", () => {
    const ev = makeAxonEvent({ event_type: "query", origin: "USER_EVENT" });
    expect(extractClaudeUserMessage(null, ev)).toBeNull();
  });
});
