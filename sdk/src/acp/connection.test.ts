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

  describe("proxied agent methods", () => {
    it("initialize() delegates to protocol.initialize()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);
      const params = { protocolVersion: "1.0", clientInfo: { name: "test" } };
      const spy = vi.spyOn(conn.protocol, "initialize").mockResolvedValue({} as never);

      await conn.initialize(params as never);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(params);

      conn.disconnect();
    });

    it("newSession() delegates to protocol.newSession()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);
      const params = { cwd: "/home/user", mcpServers: [] };
      const spy = vi.spyOn(conn.protocol, "newSession").mockResolvedValue({} as never);

      await conn.newSession(params as never);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(params);

      conn.disconnect();
    });

    it("prompt() delegates to protocol.prompt()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);
      const params = { sessionId: "s1", prompt: [{ type: "text", text: "Hello" }] };
      const spy = vi.spyOn(conn.protocol, "prompt").mockResolvedValue({} as never);

      await conn.prompt(params as never);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(params);

      conn.disconnect();
    });

    it("cancel() delegates to protocol.cancel()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);
      const params = { sessionId: "s1" };
      const spy = vi.spyOn(conn.protocol, "cancel").mockResolvedValue(undefined);

      await conn.cancel(params as never);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(params);

      conn.disconnect();
    });

    it("loadSession() delegates to protocol.loadSession()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);
      const params = { sessionId: "s1" };
      const spy = vi.spyOn(conn.protocol, "loadSession").mockResolvedValue({} as never);

      await conn.loadSession(params as never);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(params);

      conn.disconnect();
    });

    it("listSessions() delegates to protocol.listSessions()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);
      const params = {};
      const spy = vi.spyOn(conn.protocol, "listSessions").mockResolvedValue({} as never);

      await conn.listSessions(params as never);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(params);

      conn.disconnect();
    });

    it("setSessionMode() delegates to protocol.setSessionMode()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);
      const params = { sessionId: "s1", mode: "code" };
      const spy = vi.spyOn(conn.protocol, "setSessionMode").mockResolvedValue({} as never);

      await conn.setSessionMode(params as never);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(params);

      conn.disconnect();
    });

    it("extMethod() delegates to protocol.extMethod()", async () => {
      const ctrl = createControllableStream();
      const { axon } = createMockAxon(ctrl);

      const conn = new ACPAxonConnection(axon as never, { id: "dbx-test" } as never);
      const spy = vi.spyOn(conn.protocol, "extMethod").mockResolvedValue({});

      await conn.extMethod("custom/method", { key: "val" });
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith("custom/method", { key: "val" });

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

      const listenerCount = (conn as unknown as { axonEventListeners: Set<unknown> })
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
  });
});
