import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeAxonConnection } from "./connection.js";
import type { Transport } from "./transport.js";
import type { WireData } from "./types.js";

// ---------------------------------------------------------------------------
// Mock Transport
// ---------------------------------------------------------------------------

interface MockTransport extends Transport {
  _messages: WireData[];
  _waiter: ((v: IteratorResult<WireData>) => void) | null;
  _done: boolean;
  _written: string[];
  _push(msg: WireData): void;
  _end(): void;
  abortStream: ReturnType<typeof vi.fn>;
}

function createMockTransport(): MockTransport {
  const transport: MockTransport = {
    _messages: [],
    _waiter: null,
    _done: false,
    _written: [],

    connect: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockImplementation(async (data: string) => {
      transport._written.push(data);
    }),
    close: vi.fn().mockResolvedValue(undefined),
    abortStream: vi.fn(),
    isReady: vi.fn().mockReturnValue(true),

    async *readMessages() {
      while (true) {
        if (transport._messages.length > 0) {
          yield transport._messages.shift() as WireData;
          continue;
        }
        if (transport._done) return;
        const msg = await new Promise<WireData | null>((resolve) => {
          transport._waiter = (result) => {
            if (result.done) resolve(null);
            else resolve(result.value);
          };
        });
        if (msg === null) return;
        yield msg;
      }
    },

    _push(msg: WireData) {
      if (transport._waiter) {
        const resolve = transport._waiter;
        transport._waiter = null;
        resolve({ value: msg, done: false });
      } else {
        transport._messages.push(msg);
      }
    },

    _end() {
      transport._done = true;
      if (transport._waiter) {
        const resolve = transport._waiter;
        transport._waiter = null;
        resolve({ value: undefined as never, done: true });
      }
    },
  };
  return transport;
}

function createMockAxon() {
  return { id: "test-axon" };
}

// ---------------------------------------------------------------------------
// Helper to create a connected ClaudeAxonConnection with mock transport
// ---------------------------------------------------------------------------

async function createConnectedClient(
  transport: MockTransport,
  options?: {
    onDisconnect?: () => void | Promise<void>;
    model?: string;
    onError?: (error: unknown) => void;
  },
) {
  const axon = createMockAxon();
  const conn = new ClaudeAxonConnection(axon as never, { id: "dbx-test" } as never, {
    onDisconnect: options?.onDisconnect,
    model: options?.model,
    onError: options?.onError,
  });

  // Replace internal transport with mock
  (conn as unknown as { transport: Transport }).transport = transport;

  // Queue up the initialize control response so connect() succeeds.
  // The connect() method sends an initialize control_request and waits for
  // control_response. We intercept the write and respond.
  const _originalWrite = transport.write;
  (transport.write as ReturnType<typeof vi.fn>).mockImplementation(async (data: string) => {
    transport._written.push(data);
    const parsed = JSON.parse(data);
    if (parsed.type === "control_request" && parsed.request?.subtype === "initialize") {
      transport._push({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: parsed.request_id,
          response: { initialized: true },
        },
      });
    }
    if (parsed.type === "control_request" && parsed.request?.subtype === "set_model") {
      transport._push({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: parsed.request_id,
          response: {},
        },
      });
    }
  });

  await conn.connect();
  return conn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClaudeAxonConnection", () => {
  let transport: MockTransport;

  beforeEach(() => {
    transport = createMockTransport();
  });

  describe("connect()", () => {
    it("connects the transport and sends initialize control request", async () => {
      await createConnectedClient(transport);

      expect(transport.connect).toHaveBeenCalledOnce();
      const initCall = transport._written.find((w) => {
        const p = JSON.parse(w);
        return p.type === "control_request" && p.request?.subtype === "initialize";
      });
      expect(initCall).toBeDefined();
    });

    it("sends set_model after initialize when model option is provided", async () => {
      await createConnectedClient(transport, { model: "claude-sonnet-4-5" });

      const modelCall = transport._written.find((w) => {
        const p = JSON.parse(w);
        return p.type === "control_request" && p.request?.subtype === "set_model";
      });
      expect(modelCall).toBeDefined();
      expect(JSON.parse(modelCall as string).request.model).toBe("claude-sonnet-4-5");
    });

    it("throws if called on an already-disconnected instance", async () => {
      const conn = await createConnectedClient(transport);
      await conn.disconnect();

      await expect(conn.connect()).rejects.toThrow("already been disconnected");
    });
  });

  describe("send()", () => {
    it("wraps a string prompt into an SDKUserMessage", async () => {
      const conn = await createConnectedClient(transport);

      await conn.send("Hello Claude");

      const sent = transport._written.find((w) => {
        const p = JSON.parse(w);
        return p.type === "user";
      });
      expect(sent).toBeDefined();
      const parsed = JSON.parse(sent as string);
      expect(parsed.type).toBe("user");
      expect(parsed.message).toEqual({ role: "user", content: "Hello Claude" });
      expect(parsed.parent_tool_use_id).toBeNull();
    });

    it("passes SDKUserMessage objects through unchanged", async () => {
      const conn = await createConnectedClient(transport);

      const userMsg = {
        type: "user" as const,
        message: { role: "user" as const, content: "custom" },
        parent_tool_use_id: "tool_123",
      };
      await conn.send(userMsg as never);

      const sent = transport._written.find((w) => {
        const p = JSON.parse(w);
        return p.type === "user" && p.parent_tool_use_id === "tool_123";
      });
      expect(sent).toBeDefined();
    });
  });

  describe("receiveMessages()", () => {
    it("yields SDK messages (non-control) from the transport", async () => {
      const conn = await createConnectedClient(transport);

      transport._push({ type: "assistant", content: "Hi" });
      transport._push({ type: "result", cost: 0.01 });
      transport._end();

      const messages: WireData[] = [];
      for await (const msg of conn.receiveMessages()) {
        messages.push(msg as unknown as WireData);
      }

      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ type: "assistant", content: "Hi" });
      expect(messages[1]).toMatchObject({ type: "result", cost: 0.01 });
    });

    it("filters out control_response messages from the stream", async () => {
      const conn = await createConnectedClient(transport);

      transport._push({
        type: "control_response",
        response: { subtype: "success", request_id: "orphan", response: {} },
      });
      transport._push({ type: "assistant", content: "Hello" });
      transport._end();

      const messages: WireData[] = [];
      for await (const msg of conn.receiveMessages()) {
        messages.push(msg as unknown as WireData);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ type: "assistant" });
    });

    it("filters out control_cancel_request messages", async () => {
      const conn = await createConnectedClient(transport);

      transport._push({ type: "control_cancel_request" });
      transport._push({ type: "assistant", content: "Hello" });
      transport._end();

      const messages: WireData[] = [];
      for await (const msg of conn.receiveMessages()) {
        messages.push(msg as unknown as WireData);
      }

      expect(messages).toHaveLength(1);
    });

    it("returns null (ends iteration) when disconnected", async () => {
      const conn = await createConnectedClient(transport);

      const gen = conn.receiveMessages();
      const iter = gen[Symbol.asyncIterator]();

      // Disconnect while waiting for a message
      setTimeout(() => conn.disconnect(), 10);

      const result = await iter.next();
      expect(result.done).toBe(true);
    });
  });

  describe("receiveResponse()", () => {
    it("yields messages until and including a result message", async () => {
      const conn = await createConnectedClient(transport);

      transport._push({ type: "assistant", content: "thinking..." });
      transport._push({ type: "assistant", content: "done" });
      transport._push({ type: "result", cost: 0.05 });
      // This message should NOT be consumed
      transport._push({ type: "assistant", content: "next turn" });

      const messages: WireData[] = [];
      for await (const msg of conn.receiveResponse()) {
        messages.push(msg as unknown as WireData);
      }

      expect(messages).toHaveLength(3);
      expect(messages[2]).toMatchObject({ type: "result" });
    });
  });

  describe("control protocol", () => {
    it("resolves control responses to the correct pending request", async () => {
      const conn = await createConnectedClient(transport);

      // Override write to capture and respond to control requests
      (transport.write as ReturnType<typeof vi.fn>).mockImplementation(async (data: string) => {
        transport._written.push(data);
        const parsed = JSON.parse(data);
        if (parsed.type === "control_request" && parsed.request?.subtype === "interrupt") {
          setTimeout(() => {
            transport._push({
              type: "control_response",
              response: {
                subtype: "success",
                request_id: parsed.request_id,
                response: { interrupted: true },
              },
            });
          }, 5);
        }
      });

      await conn.interrupt();
      // If we get here without timeout, the control response resolved correctly
    });

    it("rejects control responses with error subtype", async () => {
      const conn = await createConnectedClient(transport);

      (transport.write as ReturnType<typeof vi.fn>).mockImplementation(async (data: string) => {
        transport._written.push(data);
        const parsed = JSON.parse(data);
        if (parsed.type === "control_request" && parsed.request?.subtype === "set_model") {
          setTimeout(() => {
            transport._push({
              type: "control_response",
              response: {
                subtype: "error",
                request_id: parsed.request_id,
                error: "Model not available",
              },
            });
          }, 5);
        }
      });

      await expect(conn.setModel("invalid-model")).rejects.toThrow("Model not available");
    });

    it("handles incoming can_use_tool control requests with allow behavior", async () => {
      await createConnectedClient(transport);

      transport._push({
        type: "control_request",
        request_id: "req_001",
        request: {
          subtype: "can_use_tool",
          tool_name: "bash",
          input: { command: "ls" },
        },
      });

      // Wait for the response to be written
      await vi.waitFor(() => {
        const resp = transport._written.find((w) => {
          const p = JSON.parse(w);
          return p.type === "control_response" && p.response?.request_id === "req_001";
        });
        expect(resp).toBeDefined();
        const parsed = JSON.parse(resp as string);
        expect(parsed.response.subtype).toBe("success");
        expect(parsed.response.response.behavior).toBe("allow");
      });
    });

    it("handles incoming hook_callback control requests with continue", async () => {
      await createConnectedClient(transport);

      transport._push({
        type: "control_request",
        request_id: "req_002",
        request: { subtype: "hook_callback" },
      });

      await vi.waitFor(() => {
        const resp = transport._written.find((w) => {
          const p = JSON.parse(w);
          return p.type === "control_response" && p.response?.request_id === "req_002";
        });
        expect(resp).toBeDefined();
        expect(JSON.parse(resp as string).response.response.continue).toBe(true);
      });
    });

    it("handles incoming mcp_message control requests with error", async () => {
      await createConnectedClient(transport);

      transport._push({
        type: "control_request",
        request_id: "req_003",
        request: { subtype: "mcp_message" },
      });

      await vi.waitFor(() => {
        const resp = transport._written.find((w) => {
          const p = JSON.parse(w);
          return p.type === "control_response" && p.response?.request_id === "req_003";
        });
        expect(resp).toBeDefined();
        expect(JSON.parse(resp as string).response.response.error).toContain("not supported");
      });
    });
  });

  describe("disconnect()", () => {
    it("closes the transport", async () => {
      const conn = await createConnectedClient(transport);
      await conn.disconnect();
      expect(transport.close).toHaveBeenCalledOnce();
    });

    it("calls onDisconnect callback if provided", async () => {
      const onDisconnect = vi.fn().mockResolvedValue(undefined);
      const conn = await createConnectedClient(transport, { onDisconnect });
      await conn.disconnect();
      expect(onDisconnect).toHaveBeenCalledOnce();
    });

    it("fails pending control requests on disconnect", async () => {
      const conn = await createConnectedClient(transport);

      // Don't respond to the control request
      (transport.write as ReturnType<typeof vi.fn>).mockImplementation(async (data: string) => {
        transport._written.push(data);
      });

      const interruptPromise = conn.interrupt();

      // Disconnect while the request is pending
      await conn.disconnect();

      await expect(interruptPromise).rejects.toThrow("Client disconnected");
    });

    it("is idempotent", async () => {
      const conn = await createConnectedClient(transport);
      await conn.disconnect();
      await conn.disconnect();
      expect(transport.close).toHaveBeenCalledOnce();
    });

    it("unblocks message waiters with null", async () => {
      const conn = await createConnectedClient(transport);

      const iter = conn.receiveMessages()[Symbol.asyncIterator]();
      const messagePromise = iter.next();

      await conn.disconnect();
      const result = await messagePromise;
      expect(result.done).toBe(true);
    });
  });

  describe("abortStream()", () => {
    it("delegates to the transport's abortStream()", async () => {
      const conn = await createConnectedClient(transport);
      conn.abortStream();
      expect(transport.abortStream).toHaveBeenCalledOnce();
    });

    it("does not clear axon event listeners", async () => {
      const conn = await createConnectedClient(transport);
      const listener = vi.fn();
      conn.onAxonEvent(listener);

      conn.abortStream();

      const emitAxonEvent = (
        conn as unknown as { emitAxonEvent: (ev: unknown) => void }
      ).emitAxonEvent.bind(conn);
      emitAxonEvent({ event_type: "test", payload: "{}", origin: "AGENT_EVENT" });
      expect(listener).toHaveBeenCalledOnce();
    });

    it("does not run the onDisconnect callback", async () => {
      const onDisconnect = vi.fn();
      const conn = await createConnectedClient(transport, { onDisconnect });
      conn.abortStream();
      expect(onDisconnect).not.toHaveBeenCalled();
    });
  });

  describe("onAxonEvent()", () => {
    it("notifies registered listeners when Axon events arrive", async () => {
      const conn = await createConnectedClient(transport);

      const listener = vi.fn();
      conn.onAxonEvent(listener);

      // Since we replaced the transport in createConnectedClient,
      // call emitAxonEvent directly to trigger the listeners.
      const emitAxonEvent = (
        conn as unknown as { emitAxonEvent: (ev: unknown) => void }
      ).emitAxonEvent.bind(conn);
      const fakeEvent = { event_type: "test", payload: "{}", origin: "AGENT_EVENT" };
      emitAxonEvent(fakeEvent);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(fakeEvent);
    });

    it("returns an unsubscribe function that removes the listener", async () => {
      const conn = await createConnectedClient(transport);

      const listener = vi.fn();
      const unsub = conn.onAxonEvent(listener);

      const emitAxonEvent = (
        conn as unknown as { emitAxonEvent: (ev: unknown) => void }
      ).emitAxonEvent.bind(conn);
      const fakeEvent = { event_type: "test", payload: "{}", origin: "AGENT_EVENT" };

      emitAxonEvent(fakeEvent);
      expect(listener).toHaveBeenCalledOnce();

      unsub();

      emitAxonEvent(fakeEvent);
      expect(listener).toHaveBeenCalledOnce();
    });

    it("catches listener exceptions and routes them to onError", async () => {
      const onError = vi.fn();
      const conn = await createConnectedClient(transport, { onError });

      const listenerError = new Error("listener boom");
      const throwingListener = vi.fn(() => {
        throw listenerError;
      });
      const normalListener = vi.fn();

      conn.onAxonEvent(throwingListener);
      conn.onAxonEvent(normalListener);

      const emitAxonEvent = (
        conn as unknown as { emitAxonEvent: (ev: unknown) => void }
      ).emitAxonEvent.bind(conn);
      emitAxonEvent({ event_type: "test", payload: "{}", origin: "AGENT_EVENT" });

      expect(throwingListener).toHaveBeenCalledOnce();
      expect(normalListener).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(listenerError);
    });

    it("defaults to console.error when onError is not provided", async () => {
      const conn = await createConnectedClient(transport);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      const listenerError = new Error("listener boom");
      conn.onAxonEvent(() => {
        throw listenerError;
      });

      const emitAxonEvent = (
        conn as unknown as { emitAxonEvent: (ev: unknown) => void }
      ).emitAxonEvent.bind(conn);
      emitAxonEvent({ event_type: "test", payload: "{}", origin: "AGENT_EVENT" });

      expect(spy).toHaveBeenCalledWith("[ClaudeAxonConnection]", listenerError);
      spy.mockRestore();
    });

    it("disconnect() clears all Axon event listeners", async () => {
      const conn = await createConnectedClient(transport);

      const listener = vi.fn();
      conn.onAxonEvent(listener);

      await conn.disconnect();

      const emitAxonEvent = (
        conn as unknown as { emitAxonEvent: (ev: unknown) => void }
      ).emitAxonEvent.bind(conn);
      emitAxonEvent({ event_type: "test", payload: "{}", origin: "AGENT_EVENT" });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("setPermissionMode()", () => {
    it("sends a set_permission_mode control request", async () => {
      const conn = await createConnectedClient(transport);

      (transport.write as ReturnType<typeof vi.fn>).mockImplementation(async (data: string) => {
        transport._written.push(data);
        const parsed = JSON.parse(data);
        if (parsed.request?.subtype === "set_permission_mode") {
          transport._push({
            type: "control_response",
            response: {
              subtype: "success",
              request_id: parsed.request_id,
              response: {},
            },
          });
        }
      });

      await conn.setPermissionMode("acceptEdits" as never);

      const modeCall = transport._written.find((w) => {
        const p = JSON.parse(w);
        return p.request?.subtype === "set_permission_mode";
      });
      expect(modeCall).toBeDefined();
      expect(JSON.parse(modeCall as string).request.mode).toBe("acceptEdits");
    });
  });
});
