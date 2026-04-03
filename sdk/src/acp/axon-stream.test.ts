import { CLIENT_METHODS } from "@agentclientprotocol/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axonStream } from "./axon-stream.js";
import {
  createControllableStream,
  createMockAxon,
  drain,
  makeAgentEvent,
  makeUserEvent,
  type PublishCall,
} from "../__test-utils__/mock-axon.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("axonStream", () => {
  describe("readable (Axon SSE → JSON-RPC)", () => {
    it("skips non-AGENT_EVENT events", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      const { readable } = axonStream({ axon: axon as never });

      ctrl.push(makeUserEvent("session/update", { foo: 1 }));
      ctrl.push(makeAgentEvent("session/update", { sessionUpdate: "usage_update" }));
      ctrl.end();

      const messages = await drain(readable);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ method: "session/update" });
    });

    it("passes through full JSON-RPC messages from the payload", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      const jsonRpcMsg = {
        jsonrpc: "2.0",
        id: 42,
        method: "test/method",
        params: { key: "value" },
      };
      ctrl.push(makeAgentEvent("anything", jsonRpcMsg));
      ctrl.end();

      const { readable } = axonStream({ axon: axon as never });
      const messages = await drain(readable);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(jsonRpcMsg);
    });

    it("wraps notification event_types (session/update) as JSON-RPC notifications", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      const update = { sessionUpdate: "agent_message_chunk", text: "hello" };
      ctrl.push(makeAgentEvent(CLIENT_METHODS.session_update, update));
      ctrl.end();

      const { readable } = axonStream({ axon: axon as never });
      const messages = await drain(readable);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        jsonrpc: "2.0",
        method: CLIENT_METHODS.session_update,
        params: update,
      });
    });

    it("correlates responses to pending outbound requests", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      const { readable, writable } = axonStream({ axon: axon as never });

      const writer = writable.getWriter();
      await writer.write({
        jsonrpc: "2.0",
        id: 1,
        method: "session/initialize",
        params: { protocolVersion: 1 },
      } as never);
      writer.releaseLock();

      const result = { capabilities: {} };
      ctrl.push(makeAgentEvent("session/initialize", result));
      ctrl.end();

      const messages = await drain(readable);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result,
      });
    });

    it("wraps agent-to-client requests (client methods) with auto-generated IDs", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      const permParams = { options: [{ kind: "allow_once", optionId: "opt1" }] };
      ctrl.push(makeAgentEvent(CLIENT_METHODS.session_request_permission, permParams));
      ctrl.end();

      const { readable } = axonStream({ axon: axon as never });
      const messages = await drain(readable);

      expect(messages).toHaveLength(1);
      const msg = messages[0] as Record<string, unknown>;
      expect(msg.jsonrpc).toBe("2.0");
      expect(msg.method).toBe(CLIENT_METHODS.session_request_permission);
      expect(msg.params).toEqual(permParams);
      expect(typeof msg.id).toBe("number");
      expect(msg.id).toBeGreaterThanOrEqual(900_000);
    });

    it("treats unknown event_types as notifications", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      ctrl.push(makeAgentEvent("custom/unknown_event", { data: 1 }));
      ctrl.end();

      const { readable } = axonStream({ axon: axon as never });
      const messages = await drain(readable);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        jsonrpc: "2.0",
        method: "custom/unknown_event",
        params: { data: 1 },
      });
    });

    it("calls onError and skips event when payload is invalid JSON", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      const onError = vi.fn();

      ctrl.push({
        event_type: "session/update",
        payload: "NOT JSON{{{",
        origin: "AGENT_EVENT",
      });
      ctrl.push(makeAgentEvent("session/update", { ok: true }));
      ctrl.end();

      const { readable } = axonStream({ axon: axon as never, onError });
      const messages = await drain(readable);

      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(SyntaxError);
      expect(messages).toHaveLength(1);
    });

    it("calls onAxonEvent for every event including non-AGENT_EVENT", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      const onAxonEvent = vi.fn();

      ctrl.push(makeUserEvent("ping", {}));
      ctrl.push(makeAgentEvent("session/update", { x: 1 }));
      ctrl.end();

      const { readable } = axonStream({ axon: axon as never, onAxonEvent });
      await drain(readable);

      expect(onAxonEvent).toHaveBeenCalledTimes(2);
    });

    it("stops reading when signal is aborted", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      const abortController = new AbortController();

      const { readable } = axonStream({
        axon: axon as never,
        signal: abortController.signal,
      });

      ctrl.push(makeAgentEvent("session/update", { a: 1 }));

      const reader = readable.getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);

      abortController.abort();
      ctrl.push(makeAgentEvent("session/update", { b: 2 }));
      ctrl.end();

      const second = await reader.read();
      expect(second.done).toBe(true);
    });

    it("calls onStreamInterrupted when SSE stream ends naturally", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      const onStreamInterrupted = vi.fn();
      ctrl.end();

      const { readable } = axonStream({ axon: axon as never, onStreamInterrupted });
      await drain(readable);

      expect(onStreamInterrupted).toHaveBeenCalledOnce();
    });

    it("calls onStreamInterrupted on SSE stream error (non-aborted)", async () => {
      const errorStream = {
        [Symbol.asyncIterator]() {
          return {
            next() {
              return Promise.reject(new Error("SSE connection lost"));
            },
          };
        },
      };
      const { axon } = createMockAxon(errorStream);

      const onStreamInterrupted = vi.fn();
      const { readable } = axonStream({ axon: axon as never, onStreamInterrupted });

      const reader = readable.getReader();
      await expect(reader.read()).rejects.toThrow("SSE connection lost");
      expect(onStreamInterrupted).toHaveBeenCalledOnce();
    });

    it("does NOT call onStreamInterrupted when signal is aborted", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      const abortController = new AbortController();
      const onStreamInterrupted = vi.fn();

      const { readable } = axonStream({
        axon: axon as never,
        signal: abortController.signal,
        onStreamInterrupted,
      });

      abortController.abort();
      ctrl.end();

      await drain(readable);
      expect(onStreamInterrupted).not.toHaveBeenCalled();
    });
  });

  describe("writable (JSON-RPC → Axon publish)", () => {
    let ctrl: ReturnType<typeof createControllableStream>;
    let axon: ReturnType<typeof createMockAxon>["axon"];
    let published: PublishCall[];

    beforeEach(() => {
      ctrl = createControllableStream();
      const mock = createMockAxon(ctrl.stream);
      axon = mock.axon;
      published = mock.published;
    });

    async function writeMessage(writable: WritableStream, msg: unknown) {
      const writer = writable.getWriter();
      await writer.write(msg);
      writer.releaseLock();
    }

    it("publishes JSON-RPC requests with method as event_type and params as payload", async () => {
      const { writable } = axonStream({ axon: axon as never });

      await writeMessage(writable, {
        jsonrpc: "2.0",
        id: 1,
        method: "session/initialize",
        params: { protocolVersion: 1 },
      });

      expect(published).toHaveLength(1);
      expect(published[0].event_type).toBe("session/initialize");
      expect(JSON.parse(published[0].payload)).toEqual({ protocolVersion: 1 });
      expect(published[0].origin).toBe("USER_EVENT");
      expect(published[0].source).toBe("broker-transport");
    });

    it("publishes JSON-RPC notifications with method as event_type", async () => {
      const { writable } = axonStream({ axon: axon as never });

      await writeMessage(writable, {
        jsonrpc: "2.0",
        method: "session/cancel",
        params: { sessionId: "s1" },
      });

      expect(published).toHaveLength(1);
      expect(published[0].event_type).toBe("session/cancel");
      expect(JSON.parse(published[0].payload)).toEqual({ sessionId: "s1" });
    });

    it("publishes notifications with empty params when params is undefined", async () => {
      const { writable } = axonStream({ axon: axon as never });

      await writeMessage(writable, {
        jsonrpc: "2.0",
        method: "session/cancel",
      });

      expect(JSON.parse(published[0].payload)).toEqual({});
    });

    it("publishes response to agent-to-client request with correct event_type", async () => {
      const { readable, writable } = axonStream({ axon: axon as never });

      // Simulate an agent-to-client request arriving
      ctrl.push(makeAgentEvent(CLIENT_METHODS.session_request_permission, { options: [] }));

      const reader = readable.getReader();
      const { value: inboundRequest } = await reader.read();
      reader.releaseLock();

      const requestId = (inboundRequest as Record<string, unknown>).id;

      // Write the response
      await writeMessage(writable, {
        jsonrpc: "2.0",
        id: requestId,
        result: { outcome: { outcome: "cancelled" } },
      });

      expect(published).toHaveLength(1);
      expect(published[0].event_type).toBe(CLIENT_METHODS.session_request_permission);
      expect(JSON.parse(published[0].payload)).toEqual({
        outcome: { outcome: "cancelled" },
      });
    });

    it("publishes error response to agent-to-client request", async () => {
      const { readable, writable } = axonStream({ axon: axon as never });

      ctrl.push(makeAgentEvent(CLIENT_METHODS.fs_read_text_file, { path: "/tmp/file" }));

      const reader = readable.getReader();
      const { value: inboundRequest } = await reader.read();
      reader.releaseLock();

      const requestId = (inboundRequest as Record<string, unknown>).id;

      await writeMessage(writable, {
        jsonrpc: "2.0",
        id: requestId,
        error: { code: -1, message: "File not found" },
      });

      expect(published).toHaveLength(1);
      expect(published[0].event_type).toBe(CLIENT_METHODS.fs_read_text_file);
      expect(JSON.parse(published[0].payload)).toEqual({
        code: -1,
        message: "File not found",
      });
    });

    it("uses 'response' as event_type for unknown response IDs", async () => {
      const { writable } = axonStream({ axon: axon as never });

      await writeMessage(writable, {
        jsonrpc: "2.0",
        id: 9999,
        result: { data: "orphan" },
      });

      expect(published).toHaveLength(1);
      expect(published[0].event_type).toBe("response");
    });

    it("uses 'unknown' event_type for unrecognizable messages", async () => {
      const { writable } = axonStream({ axon: axon as never });

      await writeMessage(writable, { jsonrpc: "2.0" });

      expect(published).toHaveLength(1);
      expect(published[0].event_type).toBe("unknown");
    });

    it("tracks pending requests for response correlation", async () => {
      const { readable, writable } = axonStream({ axon: axon as never });

      // Send two different requests
      const writer = writable.getWriter();
      await writer.write({
        jsonrpc: "2.0",
        id: 10,
        method: "session/initialize",
        params: {},
      } as never);
      await writer.write({
        jsonrpc: "2.0",
        id: 11,
        method: "session/new",
        params: {},
      } as never);
      writer.releaseLock();

      // Responses arrive in different order
      ctrl.push(makeAgentEvent("session/new", { sessionId: "s1" }));
      ctrl.push(makeAgentEvent("session/initialize", { capabilities: {} }));
      ctrl.end();

      const messages = await drain(readable);

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ jsonrpc: "2.0", id: 11, result: { sessionId: "s1" } });
      expect(messages[1]).toEqual({ jsonrpc: "2.0", id: 10, result: { capabilities: {} } });
    });
  });

  describe("end-to-end request-response cycle", () => {
    it("handles a full initialize request-response cycle", async () => {
      const ctrl = createControllableStream();
      const { axon, published } = createMockAxon(ctrl.stream);

      const { readable, writable } = axonStream({ axon: axon as never });

      const writer = writable.getWriter();
      await writer.write({
        jsonrpc: "2.0",
        id: 1,
        method: "session/initialize",
        params: { protocolVersion: 1, clientInfo: { name: "test" } },
      } as never);

      expect(published).toHaveLength(1);
      expect(published[0].event_type).toBe("session/initialize");

      ctrl.push(
        makeAgentEvent("session/initialize", {
          protocolVersion: 1,
          agentInfo: { name: "agent" },
        }),
      );
      ctrl.end();
      writer.releaseLock();

      const messages = await drain(readable);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: { protocolVersion: 1, agentInfo: { name: "agent" } },
      });
    });

    it("handles interleaved requests, notifications, and agent-to-client requests", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl.stream);

      const { readable, writable } = axonStream({ axon: axon as never });

      const writer = writable.getWriter();

      // Client sends a prompt request
      await writer.write({
        jsonrpc: "2.0",
        id: 5,
        method: "session/prompt",
        params: { sessionId: "s1", prompt: { text: "hello" } },
      } as never);

      // Agent sends a session update notification
      ctrl.push(
        makeAgentEvent(CLIENT_METHODS.session_update, {
          sessionUpdate: "agent_message_chunk",
          text: "Hi",
        }),
      );

      // Agent sends a permission request (client method)
      ctrl.push(
        makeAgentEvent(CLIENT_METHODS.session_request_permission, {
          options: [{ kind: "allow_once", optionId: "o1" }],
        }),
      );

      const reader = readable.getReader();

      const msg1 = await reader.read();
      expect((msg1.value as Record<string, unknown>).method).toBe(CLIENT_METHODS.session_update);

      const msg2 = await reader.read();
      const permRequest = msg2.value as Record<string, unknown>;
      expect(permRequest.method).toBe(CLIENT_METHODS.session_request_permission);

      reader.releaseLock();

      // Client responds to the permission request
      await writer.write({
        jsonrpc: "2.0",
        id: permRequest.id,
        result: { outcome: { outcome: "selected", optionId: "o1" } },
      } as never);

      // Agent sends the prompt response
      ctrl.push(makeAgentEvent("session/prompt", { stopReason: "end_turn" }));
      ctrl.end();
      writer.releaseLock();

      const reader2 = readable.getReader();
      const msg3 = await reader2.read();
      expect(msg3.value).toMatchObject({
        jsonrpc: "2.0",
        id: 5,
        result: { stopReason: "end_turn" },
      });
    });
  });
});
