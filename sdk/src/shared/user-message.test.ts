import { describe, expect, it } from "vitest";
import { makeFullAxonEvent } from "../__test-utils__/mock-axon.js";
import { extractACPUserMessage, extractClaudeUserMessage } from "./user-message.js";

describe("extractACPUserMessage", () => {
  const makeUserPromptEvent = (prompt: unknown) =>
    makeFullAxonEvent({
      origin: "USER_EVENT",
      event_type: "session/prompt",
      payload: JSON.stringify({ prompt, sessionId: "s-1" }),
    });

  it("extracts text from a text-only prompt", () => {
    const ev = makeUserPromptEvent([{ type: "text", text: "Hello world" }]);
    const result = extractACPUserMessage({ prompt: [{ type: "text", text: "Hello world" }] }, ev);
    expect(result).toEqual({
      text: "Hello world",
      content: [{ type: "text", text: "Hello world" }],
      sequence: 1,
    });
  });

  it("concatenates multiple text blocks", () => {
    const blocks = [
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ];
    const ev = makeUserPromptEvent(blocks);
    const result = extractACPUserMessage({ prompt: blocks }, ev);
    expect(result?.text).toBe("Hello world");
    expect(result?.content).toHaveLength(2);
  });

  it("includes image blocks in content but not in text", () => {
    const blocks = [
      { type: "text", text: "Look at this:" },
      { type: "image", data: "base64data", mimeType: "image/png" },
    ];
    const ev = makeUserPromptEvent(blocks);
    const result = extractACPUserMessage({ prompt: blocks }, ev);
    expect(result?.text).toBe("Look at this:");
    expect(result?.content).toHaveLength(2);
    expect(result?.content[1]).toEqual({
      type: "image",
      data: "base64data",
      mimeType: "image/png",
    });
  });

  it("returns null for non-USER_EVENT origin", () => {
    const ev = makeFullAxonEvent({
      origin: "AGENT_EVENT",
      event_type: "session/prompt",
    });
    expect(extractACPUserMessage({ prompt: [{ type: "text", text: "hi" }] }, ev)).toBeNull();
  });

  it("returns null for wrong event_type", () => {
    const ev = makeFullAxonEvent({
      origin: "USER_EVENT",
      event_type: "session/update",
    });
    expect(extractACPUserMessage({ prompt: [{ type: "text", text: "hi" }] }, ev)).toBeNull();
  });

  it("returns null for null data", () => {
    const ev = makeFullAxonEvent({
      origin: "USER_EVENT",
      event_type: "session/prompt",
    });
    expect(extractACPUserMessage(null, ev)).toBeNull();
  });

  it("returns null when prompt is not an array", () => {
    const ev = makeFullAxonEvent({
      origin: "USER_EVENT",
      event_type: "session/prompt",
    });
    expect(extractACPUserMessage({ prompt: "just a string" }, ev)).toBeNull();
  });

  it("skips blocks without a type field", () => {
    const blocks = [{ type: "text", text: "valid" }, { noType: true }];
    const ev = makeUserPromptEvent(blocks);
    const result = extractACPUserMessage({ prompt: blocks }, ev);
    expect(result?.content).toHaveLength(1);
    expect(result?.text).toBe("valid");
  });

  it("uses the axonEvent sequence", () => {
    const ev = makeFullAxonEvent({
      origin: "USER_EVENT",
      event_type: "session/prompt",
      sequence: 42,
    });
    const result = extractACPUserMessage({ prompt: [{ type: "text", text: "hi" }] }, ev);
    expect(result?.sequence).toBe(42);
  });
});

describe("extractClaudeUserMessage", () => {
  it("extracts text from a string content", () => {
    const ev = makeFullAxonEvent({
      origin: "USER_EVENT",
      event_type: "query",
    });
    const data = { type: "user", message: { content: "Hello world" } };
    const result = extractClaudeUserMessage(data, ev);
    expect(result).toEqual({
      text: "Hello world",
      content: [{ type: "text", text: "Hello world" }],
      sequence: 1,
    });
  });

  it("extracts text from array content blocks", () => {
    const ev = makeFullAxonEvent({ origin: "USER_EVENT" });
    const data = {
      type: "user",
      message: {
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" },
        ],
      },
    };
    const result = extractClaudeUserMessage(data, ev);
    expect(result?.text).toBe("Hello world");
    expect(result?.content).toHaveLength(2);
  });

  it("includes image blocks in content but not in text", () => {
    const ev = makeFullAxonEvent({ origin: "USER_EVENT" });
    const data = {
      type: "user",
      message: {
        content: [
          { type: "text", text: "Look:" },
          { type: "image", source: { data: "base64" } },
        ],
      },
    };
    const result = extractClaudeUserMessage(data, ev);
    expect(result?.text).toBe("Look:");
    expect(result?.content).toHaveLength(2);
  });

  it("returns null for non-USER_EVENT origin", () => {
    const ev = makeFullAxonEvent({ origin: "AGENT_EVENT" });
    const data = { type: "user", message: { content: "hi" } };
    expect(extractClaudeUserMessage(data, ev)).toBeNull();
  });

  it("returns null when type is not user", () => {
    const ev = makeFullAxonEvent({ origin: "USER_EVENT" });
    const data = { type: "assistant", message: { content: "hi" } };
    expect(extractClaudeUserMessage(data, ev)).toBeNull();
  });

  it("returns null for null data", () => {
    const ev = makeFullAxonEvent({ origin: "USER_EVENT" });
    expect(extractClaudeUserMessage(null, ev)).toBeNull();
  });

  it("returns null for non-object data", () => {
    const ev = makeFullAxonEvent({ origin: "USER_EVENT" });
    expect(extractClaudeUserMessage("string", ev)).toBeNull();
  });

  it("returns empty text when message.content is missing", () => {
    const ev = makeFullAxonEvent({ origin: "USER_EVENT" });
    const data = { type: "user", message: {} };
    const result = extractClaudeUserMessage(data, ev);
    expect(result?.text).toBe("");
    expect(result?.content).toHaveLength(0);
  });

  it("uses the axonEvent sequence", () => {
    const ev = makeFullAxonEvent({ origin: "USER_EVENT", sequence: 99 });
    const data = { type: "user", message: { content: "hi" } };
    const result = extractClaudeUserMessage(data, ev);
    expect(result?.sequence).toBe(99);
  });
});
