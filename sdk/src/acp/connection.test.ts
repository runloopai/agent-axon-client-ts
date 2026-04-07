import { PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createControllableStream,
  createMockAxon,
  makeAgentEvent,
} from "../__test-utils__/mock-axon.js";
import { ACPAxonConnection } from "./connection.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePermissionOptions(kinds: string[]) {
  return kinds.map((kind, i) => ({
    kind,
    name: `Option ${kind}`,
    optionId: `opt${i + 1}`,
  }));
}

function makePermissionRequest(options: ReturnType<typeof makePermissionOptions>) {
  return {
    sessionId: "test-session",
    toolCall: { toolCallId: "tc-1" },
    options,
  };
}

function makeSessionNotification(update: Record<string, unknown>, sessionId?: string) {
  return {
    sessionId: sessionId ?? "test-session",
    update,
  };
}

function makeUsageUpdate() {
  return { sessionUpdate: "usage_update", size: 100000, used: 5000 };
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timeout"));
      setTimeout(check, 10);
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ACPAxonConnection", () => {
  describe("constructor properties", () => {
    it("exposes axonId from the provided Axon", () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);
      expect(conn.axonId).toBe("test-axon");
      conn.disconnect();
    });

    it("exposes devboxId from the positional parameter", () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-456" } as never);
      expect(conn.devboxId).toBe("dbx-456");
      conn.disconnect();
    });
  });

  describe("default permission handler", () => {
    it("prefers allow_always when available", async () => {
      const ctrl = createControllableStream();
      const { axon, published } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const options = makePermissionOptions(["allow_once", "allow_always", "reject_once"]);
      ctrl.push(makeAgentEvent("session/request_permission", makePermissionRequest(options)));

      await waitFor(() => published.some((p) => p.event_type === "session/request_permission"));

      const response = published.find((p) => p.event_type === "session/request_permission");
      const payload = JSON.parse(response?.payload as string);
      expect(payload.outcome.outcome).toBe("selected");
      expect(payload.outcome.optionId).toBe("opt2");

      conn.disconnect();
    });

    it("falls back to allow_once when allow_always is not available", async () => {
      const ctrl = createControllableStream();
      const { axon, published } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const options = makePermissionOptions(["reject_once", "allow_once"]);
      ctrl.push(makeAgentEvent("session/request_permission", makePermissionRequest(options)));

      await waitFor(() => published.some((p) => p.event_type === "session/request_permission"));

      const response = published.find((p) => p.event_type === "session/request_permission");
      const payload = JSON.parse(response?.payload as string);
      expect(payload.outcome.outcome).toBe("selected");
      expect(payload.outcome.optionId).toBe("opt2");

      conn.disconnect();
    });

    it("falls back to first option when neither allow_always nor allow_once exists", async () => {
      const ctrl = createControllableStream();
      const { axon, published } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const options = makePermissionOptions(["reject_once", "reject_always"]);
      ctrl.push(makeAgentEvent("session/request_permission", makePermissionRequest(options)));

      await waitFor(() => published.some((p) => p.event_type === "session/request_permission"));

      const response = published.find((p) => p.event_type === "session/request_permission");
      const payload = JSON.parse(response?.payload as string);
      expect(payload.outcome.outcome).toBe("selected");
      expect(payload.outcome.optionId).toBe("opt1");

      conn.disconnect();
    });

    it("returns cancelled when options array is empty", async () => {
      const ctrl = createControllableStream();
      const { axon, published } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      ctrl.push(makeAgentEvent("session/request_permission", makePermissionRequest([])));

      await waitFor(() => published.some((p) => p.event_type === "session/request_permission"));

      const response = published.find((p) => p.event_type === "session/request_permission");
      const payload = JSON.parse(response?.payload as string);
      expect(payload.outcome.outcome).toBe("cancelled");

      conn.disconnect();
    });

    it("uses custom requestPermission handler when provided", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const customHandler = vi.fn().mockResolvedValue({
        outcome: { outcome: "selected", optionId: "opt1" },
      });

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never, {
        requestPermission: customHandler,
      });

      const options = makePermissionOptions(["allow_always"]);
      ctrl.push(makeAgentEvent("session/request_permission", makePermissionRequest(options)));

      await waitFor(() => customHandler.mock.calls.length > 0);

      expect(customHandler).toHaveBeenCalledOnce();
      expect(customHandler.mock.calls[0][0].options).toEqual(options);

      conn.disconnect();
    });
  });

  describe("onSessionUpdate listeners", () => {
    it("notifies all registered listeners on session/update events", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      conn.onSessionUpdate(listener1);
      conn.onSessionUpdate(listener2);

      ctrl.push(makeAgentEvent("session/update", makeSessionNotification(makeUsageUpdate(), "s1")));

      await waitFor(() => listener1.mock.calls.length > 0);

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();

      expect(listener1.mock.calls[0][0]).toBe("s1");
      expect(listener1.mock.calls[0][1]).toMatchObject({
        sessionUpdate: "usage_update",
      });

      conn.disconnect();
    });

    it("returns an unsubscribe function that removes the listener", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const listener = vi.fn();
      const unsubscribe = conn.onSessionUpdate(listener);

      ctrl.push(makeAgentEvent("session/update", makeSessionNotification(makeUsageUpdate(), "s1")));

      await waitFor(() => listener.mock.calls.length > 0);
      expect(listener).toHaveBeenCalledOnce();

      unsubscribe();

      ctrl.push(makeAgentEvent("session/update", makeSessionNotification(makeUsageUpdate(), "s1")));

      await new Promise((r) => setTimeout(r, 100));
      expect(listener).toHaveBeenCalledOnce();

      conn.disconnect();
    });
  });

  describe("onAxonEvent listeners", () => {
    it("notifies all registered listeners for every Axon event", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const listener = vi.fn();
      conn.onAxonEvent(listener);

      ctrl.push(makeAgentEvent("session/update", makeSessionNotification(makeUsageUpdate())));
      ctrl.push({
        event_type: "ping",
        payload: "{}",
        origin: "USER_EVENT",
      });

      await waitFor(() => listener.mock.calls.length >= 2);
      expect(listener).toHaveBeenCalledTimes(2);

      conn.disconnect();
    });

    it("returns an unsubscribe function", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const listener = vi.fn();
      const unsub = conn.onAxonEvent(listener);

      ctrl.push(makeAgentEvent("session/update", makeSessionNotification(makeUsageUpdate())));
      await waitFor(() => listener.mock.calls.length > 0);

      unsub();

      ctrl.push(makeAgentEvent("session/update", makeSessionNotification(makeUsageUpdate())));
      await new Promise((r) => setTimeout(r, 100));
      expect(listener).toHaveBeenCalledOnce();

      conn.disconnect();
    });
  });

  describe("error isolation", () => {
    it("catches listener exceptions without crashing the connection", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const onError = vi.fn();
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never, { onError });

      const throwingListener = vi.fn().mockImplementation(() => {
        throw new Error("listener boom");
      });
      const normalListener = vi.fn();

      conn.onSessionUpdate(throwingListener);
      conn.onSessionUpdate(normalListener);

      ctrl.push(makeAgentEvent("session/update", makeSessionNotification(makeUsageUpdate(), "s1")));

      await waitFor(() => normalListener.mock.calls.length > 0);

      expect(throwingListener).toHaveBeenCalledOnce();
      expect(normalListener).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);

      conn.disconnect();
    });

    it("catches Axon event listener exceptions without crashing", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const onError = vi.fn();
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never, { onError });

      conn.onAxonEvent(() => {
        throw new Error("raw listener boom");
      });

      ctrl.push(makeAgentEvent("session/update", makeSessionNotification(makeUsageUpdate())));

      await waitFor(() => onError.mock.calls.length > 0);
      expect(onError).toHaveBeenCalled();

      conn.disconnect();
    });
  });

  describe("abortStream()", () => {
    it("does not clear session update listeners", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const listener = vi.fn();
      conn.onSessionUpdate(listener);

      conn.abortStream();

      // Listeners should still be registered (inspectable via private set size)
      const listenerCount = (conn as unknown as { sessionUpdateListeners: Set<unknown> })
        .sessionUpdateListeners.size;
      expect(listenerCount).toBe(1);

      conn.disconnect();
    });

    it("does not clear axon event listeners", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const listener = vi.fn();
      conn.onAxonEvent(listener);

      conn.abortStream();

      const listenerCount = (conn as unknown as { axonEventListeners: { size: number } })
        .axonEventListeners.size;
      expect(listenerCount).toBe(1);

      conn.disconnect();
    });

    it("does not run the onDisconnect callback", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const onDisconnect = vi.fn();
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never, {
        onDisconnect,
      });

      conn.abortStream();
      expect(onDisconnect).not.toHaveBeenCalled();

      conn.disconnect();
    });
  });

  describe("lifecycle", () => {
    it("disconnect() clears all listeners", () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const sessionListener = vi.fn();
      const rawListener = vi.fn();
      conn.onSessionUpdate(sessionListener);
      conn.onAxonEvent(rawListener);

      conn.disconnect();

      ctrl.push(makeAgentEvent("session/update", makeSessionNotification(makeUsageUpdate())));
      ctrl.end();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(sessionListener).not.toHaveBeenCalled();
          expect(rawListener).not.toHaveBeenCalled();
          resolve();
        }, 50);
      });
    });

    it("disconnect() runs the onDisconnect callback", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const onDisconnect = vi.fn().mockResolvedValue(undefined);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never, {
        onDisconnect,
      });

      await conn.disconnect();

      expect(onDisconnect).toHaveBeenCalledOnce();
    });

    it("disconnect() works when no onDisconnect callback is provided", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);
      await conn.disconnect();
    });

    it("disconnect() is idempotent — second call is a no-op", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const onDisconnect = vi.fn().mockResolvedValue(undefined);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never, {
        onDisconnect,
      });

      await conn.disconnect();
      await conn.disconnect();

      expect(onDisconnect).toHaveBeenCalledOnce();
    });
  });

  describe("proxied agent methods", () => {
    it("initialize() delegates to protocol.initialize()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const mockResult = { protocolVersion: PROTOCOL_VERSION, serverInfo: { name: "test" } };
      conn.protocol.initialize = vi.fn().mockResolvedValue(mockResult);

      const result = await conn.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "test", version: "1.0" },
      });

      expect(conn.protocol.initialize).toHaveBeenCalledOnce();
      expect(result).toBe(mockResult);
      conn.disconnect();
    });

    it("newSession() delegates to protocol.newSession()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const mockResult = { sessionId: "s-1" };
      conn.protocol.newSession = vi.fn().mockResolvedValue(mockResult);

      const result = await conn.newSession({ cwd: "/home/user", mcpServers: [] } as never);

      expect(conn.protocol.newSession).toHaveBeenCalledOnce();
      expect(result).toBe(mockResult);
      conn.disconnect();
    });

    it("prompt() delegates to protocol.prompt()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const mockResult = { stopReason: "end_turn" };
      conn.protocol.prompt = vi.fn().mockResolvedValue(mockResult);

      const result = await conn.prompt({
        sessionId: "s-1",
        prompt: [{ type: "text", text: "Hello" }],
      } as never);

      expect(conn.protocol.prompt).toHaveBeenCalledOnce();
      expect(result).toBe(mockResult);
      conn.disconnect();
    });

    it("cancel() delegates to protocol.cancel()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      conn.protocol.cancel = vi.fn().mockResolvedValue(undefined);

      await conn.cancel({ sessionId: "s-1" } as never);

      expect(conn.protocol.cancel).toHaveBeenCalledOnce();
      conn.disconnect();
    });

    it("listSessions() delegates to protocol.listSessions()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const mockResult = { sessions: [] };
      conn.protocol.listSessions = vi.fn().mockResolvedValue(mockResult);

      const result = await conn.listSessions({} as never);

      expect(conn.protocol.listSessions).toHaveBeenCalledOnce();
      expect(result).toBe(mockResult);
      conn.disconnect();
    });

    it("loadSession() delegates to protocol.loadSession()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const mockResult = { sessionId: "s-1" };
      conn.protocol.loadSession = vi.fn().mockResolvedValue(mockResult);

      const result = await conn.loadSession({ sessionId: "s-1" } as never);

      expect(conn.protocol.loadSession).toHaveBeenCalledOnce();
      expect(result).toBe(mockResult);
      conn.disconnect();
    });

    it("setSessionMode() delegates to protocol.setSessionMode()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      conn.protocol.setSessionMode = vi.fn().mockResolvedValue({});

      await conn.setSessionMode({ sessionId: "s-1", mode: "code" } as never);

      expect(conn.protocol.setSessionMode).toHaveBeenCalledOnce();
      conn.disconnect();
    });

    it("extMethod() delegates to protocol.extMethod()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const mockResult = { data: "custom" };
      conn.protocol.extMethod = vi.fn().mockResolvedValue(mockResult);

      const result = await conn.extMethod("custom/method", { key: "value" });

      expect(conn.protocol.extMethod).toHaveBeenCalledWith("custom/method", { key: "value" });
      expect(result).toBe(mockResult);
      conn.disconnect();
    });

    it("extNotification() delegates to protocol.extNotification()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      conn.protocol.extNotification = vi.fn().mockResolvedValue(undefined);

      await conn.extNotification("custom/notify", { data: true });

      expect(conn.protocol.extNotification).toHaveBeenCalledWith("custom/notify", { data: true });
      conn.disconnect();
    });

    it("authenticate() delegates to protocol.authenticate()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const mockResult = { success: true };
      conn.protocol.authenticate = vi.fn().mockResolvedValue(mockResult);

      const result = await conn.authenticate({ method: "token", credentials: {} } as never);

      expect(conn.protocol.authenticate).toHaveBeenCalledOnce();
      expect(result).toBe(mockResult);
      conn.disconnect();
    });

    it("setSessionConfigOption() delegates to protocol.setSessionConfigOption()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const mockResult = {};
      conn.protocol.setSessionConfigOption = vi.fn().mockResolvedValue(mockResult);

      const result = await conn.setSessionConfigOption({
        sessionId: "s-1",
        key: "maxTokens",
        value: 1000,
      } as never);

      expect(conn.protocol.setSessionConfigOption).toHaveBeenCalledOnce();
      expect(result).toBe(mockResult);
      conn.disconnect();
    });
  });

  describe("signal and closed getters", () => {
    it("signal returns the protocol's abort signal", () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      expect(conn.signal).toBe(conn.protocol.signal);
      conn.disconnect();
    });

    it("closed returns the protocol's closed promise", () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      expect(conn.closed).toBe(conn.protocol.closed);
      conn.disconnect();
    });
  });

  describe("sessionId handling", () => {
    it("passes the sessionId through to listeners", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      const listener = vi.fn();
      conn.onSessionUpdate(listener);

      ctrl.push(
        makeAgentEvent("session/update", makeSessionNotification(makeUsageUpdate(), "s-42")),
      );

      await waitFor(() => listener.mock.calls.length > 0);

      expect(listener.mock.calls[0][0]).toBe("s-42");

      conn.disconnect();
    });
  });

  describe("disconnect guard", () => {
    it("throws when calling methods after disconnect()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);

      await conn.disconnect();

      expect(() => conn.initialize({} as never)).toThrow("disconnected");
      expect(() => conn.newSession({} as never)).toThrow("disconnected");
      expect(() => conn.loadSession({} as never)).toThrow("disconnected");
      expect(() => conn.listSessions({} as never)).toThrow("disconnected");
      expect(() => conn.prompt({} as never)).toThrow("disconnected");
      expect(() => conn.cancel({} as never)).toThrow("disconnected");
      expect(() => conn.authenticate({} as never)).toThrow("disconnected");
      expect(() => conn.setSessionMode({} as never)).toThrow("disconnected");
      expect(() => conn.setSessionConfigOption({} as never)).toThrow("disconnected");
      expect(() => conn.extMethod("x", {})).toThrow("disconnected");
      expect(() => conn.extNotification("x", {})).toThrow("disconnected");
    });
  });

  describe("disconnect() error routing", () => {
    it("routes onDisconnect errors to the onError handler", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const onError = vi.fn();
      const disconnectError = new Error("devbox shutdown failed");
      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never, {
        onDisconnect: () => {
          throw disconnectError;
        },
        onError,
      });

      await conn.disconnect();

      expect(onError).toHaveBeenCalledWith(disconnectError);
    });
  });
});
