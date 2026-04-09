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
    expect(result).toEqual({
      text: "hello world",
      content: [{ type: "text", text: "hello world" }],
      sequence: 1,
    });
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
    expect(result).toEqual({
      text: "first second",
      content: [
        { type: "text", text: "first " },
        { type: "text", text: "second" },
      ],
      sequence: 1,
    });
  });

  it("includes non-text blocks in content but not in text", () => {
    const imageBlock = { type: "image", data: "base64..." };
    const textBlock = { type: "text", text: "only this" };
    const data = {
      prompt: [imageBlock, textBlock],
    };
    const ev = makeAxonEvent();
    const result = extractACPUserMessage(data, ev);
    expect(result).toEqual({
      text: "only this",
      content: [imageBlock, textBlock],
      sequence: 1,
    });
  });

  it("preserves audio content blocks", () => {
    const audioBlock = { type: "audio", data: "base64audio", mediaType: "audio/wav" };
    const textBlock = { type: "text", text: "listen to this" };
    const data = { prompt: [textBlock, audioBlock] };
    const ev = makeAxonEvent();
    const result = extractACPUserMessage(data, ev);
    expect(result?.content).toHaveLength(2);
    expect(result?.content[1]).toEqual(audioBlock);
    expect(result?.text).toBe("listen to this");
  });

  it("preserves resource_link content blocks", () => {
    const resourceBlock = { type: "resource_link", uri: "file:///foo.txt" };
    const data = { prompt: [resourceBlock] };
    const ev = makeAxonEvent();
    const result = extractACPUserMessage(data, ev);
    expect(result?.content).toEqual([resourceBlock]);
    expect(result?.text).toBe("");
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
    expect(result).toEqual({
      text: "hello claude",
      content: [{ type: "text", text: "hello claude" }],
      sequence: 1,
    });
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
    expect(result).toEqual({
      text: "part one part two",
      content: [
        { type: "text", text: "part one " },
        { type: "text", text: "part two" },
      ],
      sequence: 1,
    });
  });

  it("includes non-text blocks in content but not in text", () => {
    const imageBlock = { type: "image", source: { type: "base64", data: "abc" } };
    const textBlock = { type: "text", text: "only text" };
    const data = {
      type: "user",
      message: { content: [imageBlock, textBlock] },
    };
    const ev = makeAxonEvent({ event_type: "query", origin: "USER_EVENT" });
    const result = extractClaudeUserMessage(data, ev);
    expect(result).toEqual({
      text: "only text",
      content: [imageBlock, textBlock],
      sequence: 1,
    });
  });

  it("preserves document content blocks", () => {
    const docBlock = { type: "document", source: { type: "base64", data: "pdf..." } };
    const data = {
      type: "user",
      message: { content: [docBlock] },
    };
    const ev = makeAxonEvent({ event_type: "query", origin: "USER_EVENT" });
    const result = extractClaudeUserMessage(data, ev);
    expect(result?.content).toEqual([docBlock]);
    expect(result?.text).toBe("");
  });

  it("preserves tool_result content blocks", () => {
    const toolBlock = {
      type: "tool_result",
      tool_use_id: "tu_123",
      content: "result text",
    };
    const data = {
      type: "user",
      message: { content: [toolBlock] },
    };
    const ev = makeAxonEvent({ event_type: "query", origin: "USER_EVENT" });
    const result = extractClaudeUserMessage(data, ev);
    expect(result?.content).toEqual([toolBlock]);
    expect(result?.text).toBe("");
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
