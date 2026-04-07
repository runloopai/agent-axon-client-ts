import { beforeEach, describe, expect, it } from "vitest";
import {
  createControllableStream,
  createMockAxon,
  makeAgentEvent,
  makeUserEvent,
} from "../__test-utils__/mock-axon.js";
import { AxonTransport, MESSAGE_TYPE_TO_EVENT_TYPE } from "./transport.js";

// ---------------------------------------------------------------------------
// MESSAGE_TYPE_TO_EVENT_TYPE constant tests (preserved from original)
// ---------------------------------------------------------------------------

describe("MESSAGE_TYPE_TO_EVENT_TYPE", () => {
  const expectedMappings: Record<string, string> = {
    user: "query",
    assistant: "assistant",
    result: "result",
    system: "system",
    control_request: "control_request",
    control_response: "control_response",
  };

  it("contains all expected keys", () => {
    expect(Object.keys(MESSAGE_TYPE_TO_EVENT_TYPE).sort()).toEqual(
      Object.keys(expectedMappings).sort(),
    );
  });

  for (const [msgType, eventType] of Object.entries(expectedMappings)) {
    it(`maps "${msgType}" to "${eventType}"`, () => {
      expect(MESSAGE_TYPE_TO_EVENT_TYPE[msgType]).toBe(eventType);
    });
  }
});

// ---------------------------------------------------------------------------
// AxonTransport class tests
// ---------------------------------------------------------------------------

describe("AxonTransport", () => {
  let ctrl: ReturnType<typeof createControllableStream>;
  let axon: ReturnType<typeof createMockAxon>["axon"];
  let transport: AxonTransport;

  beforeEach(() => {
    ctrl = createControllableStream(true);
    const mock = createMockAxon(ctrl);
    axon = mock.axon;
    transport = new AxonTransport(axon as never);
  });

  describe("connect()", () => {
    it("subscribes to the Axon SSE stream", async () => {
      await transport.connect();
      expect(axon.subscribeSse).toHaveBeenCalledOnce();
    });

    it("sets isReady() to true after connect", async () => {
      expect(transport.isReady()).toBe(false);
      await transport.connect();
      expect(transport.isReady()).toBe(true);
    });
  });

  describe("write()", () => {
    it("throws when transport is not ready", async () => {
      await expect(transport.write(JSON.stringify({ type: "user" }))).rejects.toThrow(
        "Transport is not ready",
      );
    });

    it("resolves event_type from message JSON type field", async () => {
      await transport.connect();
      await transport.write(
        JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
      );

      expect(axon.publish).toHaveBeenCalledOnce();
      expect(axon.publish.mock.calls[0][0]).toMatchObject({
        event_type: "query",
        origin: "USER_EVENT",
        source: "claude-sdk-client",
      });
    });

    it("uses the type value itself when not in mapping table", async () => {
      await transport.connect();
      await transport.write(JSON.stringify({ type: "custom_type" }));

      expect(axon.publish.mock.calls[0][0].event_type).toBe("custom_type");
    });

    it("falls back to 'query' for messages without a type field", async () => {
      await transport.connect();
      await transport.write(JSON.stringify({ content: "no type" }));

      expect(axon.publish.mock.calls[0][0].event_type).toBe("query");
    });

    it("falls back to 'query' when data is not valid JSON", async () => {
      await transport.connect();
      await transport.write("not json {{{");

      expect(axon.publish.mock.calls[0][0].event_type).toBe("query");
    });

    it("publishes the raw data string as payload", async () => {
      await transport.connect();
      const data = JSON.stringify({ type: "user", message: "hello" });
      await transport.write(data);

      expect(axon.publish.mock.calls[0][0].payload).toBe(data);
    });
  });

  describe("readMessages()", () => {
    it("throws if called before connect()", async () => {
      const gen = transport.readMessages();
      await expect(gen[Symbol.asyncIterator]().next()).rejects.toThrow("Transport not connected");
    });

    it("yields parsed JSON from AGENT_EVENT events", async () => {
      await transport.connect();

      const data = { type: "assistant", content: "hello" };
      ctrl.push(makeAgentEvent("assistant", data));
      ctrl.end();

      const messages: unknown[] = [];
      for await (const msg of transport.readMessages()) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(data);
    });

    it("skips USER_EVENT events", async () => {
      await transport.connect();

      ctrl.push(makeUserEvent("query", { type: "user" }));
      ctrl.push(makeAgentEvent("assistant", { type: "assistant", text: "hi" }));
      ctrl.end();

      const messages: unknown[] = [];
      for await (const msg of transport.readMessages()) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ type: "assistant" });
    });

    it("skips events with unparseable payloads", async () => {
      await transport.connect();

      ctrl.push({
        event_type: "assistant",
        payload: "NOT VALID JSON",
        origin: "AGENT_EVENT",
      });
      ctrl.push(makeAgentEvent("result", { type: "result" }));
      ctrl.end();

      const messages: unknown[] = [];
      for await (const msg of transport.readMessages()) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ type: "result" });
    });

    it("stops yielding when transport is closed", async () => {
      await transport.connect();

      ctrl.push(makeAgentEvent("assistant", { n: 1 }));

      const gen = transport.readMessages()[Symbol.asyncIterator]();
      const first = await gen.next();
      expect(first.done).toBe(false);
      expect(first.value).toMatchObject({ n: 1 });

      await transport.close();
      ctrl.push(makeAgentEvent("assistant", { n: 2 }));
      ctrl.end();

      const second = await gen.next();
      expect(second.done).toBe(true);
    });
  });

  describe("close()", () => {
    it("sets isReady() to false", async () => {
      await transport.connect();
      expect(transport.isReady()).toBe(true);

      await transport.close();
      expect(transport.isReady()).toBe(false);
    });

    it("aborts the SSE stream controller", async () => {
      await transport.connect();
      await transport.close();

      expect(ctrl.stream.controller?.abort).toHaveBeenCalledOnce();
    });

    it("is idempotent — second close is a no-op", async () => {
      await transport.connect();
      await transport.close();
      await transport.close();

      expect(ctrl.stream.controller?.abort).toHaveBeenCalledOnce();
    });
  });

  describe("reconnect()", () => {
    it("re-subscribes to the Axon SSE stream", async () => {
      await transport.connect();

      const ctrl2 = createControllableStream(true);
      axon.subscribeSse.mockResolvedValueOnce(ctrl2.stream);

      await transport.reconnect();

      expect(axon.subscribeSse).toHaveBeenCalledTimes(2);
    });

    it("passes after_sequence from last seen event on re-subscribe", async () => {
      await transport.connect();

      ctrl.push(makeAgentEvent("assistant", { type: "assistant", text: "hi" }, 42));
      ctrl.push(makeAgentEvent("result", { type: "result" }, 43));
      ctrl.end();

      for await (const _msg of transport.readMessages()) {
        // drain
      }

      const ctrl2 = createControllableStream(true);
      axon.subscribeSse.mockResolvedValueOnce(ctrl2.stream);

      await transport.reconnect();

      expect(axon.subscribeSse).toHaveBeenCalledTimes(2);
      expect(axon.subscribeSse).toHaveBeenNthCalledWith(1);
      expect(axon.subscribeSse).toHaveBeenNthCalledWith(2, { after_sequence: 43 });
    });

    it("passes no after_sequence when no events were received", async () => {
      await transport.connect();

      const ctrl2 = createControllableStream(true);
      axon.subscribeSse.mockResolvedValueOnce(ctrl2.stream);

      await transport.reconnect();

      expect(axon.subscribeSse).toHaveBeenNthCalledWith(2, undefined);
    });

    it("no-ops after close()", async () => {
      await transport.connect();
      await transport.close();

      await transport.reconnect();

      expect(axon.subscribeSse).toHaveBeenCalledTimes(1);
      expect(transport.isReady()).toBe(false);
    });
  });

  describe("isReady()", () => {
    it("returns false before connect", () => {
      expect(transport.isReady()).toBe(false);
    });

    it("returns true after connect", async () => {
      await transport.connect();
      expect(transport.isReady()).toBe(true);
    });

    it("returns false after close", async () => {
      await transport.connect();
      await transport.close();
      expect(transport.isReady()).toBe(false);
    });
  });
});
