import { describe, expect, it, vi } from "vitest";
import { runDisconnectHook } from "./lifecycle.js";

describe("runDisconnectHook", () => {
  const log = vi.fn();
  const onError = vi.fn();

  it("is a no-op when the callback is undefined", async () => {
    await runDisconnectHook(undefined, log, onError);

    expect(log).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("invokes a synchronous callback", async () => {
    const fn = vi.fn();

    await runDisconnectHook(fn, log, onError);

    expect(fn).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("disconnect", "onDisconnect callback completed");
    expect(onError).not.toHaveBeenCalled();
  });

  it("invokes an async callback", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);

    await runDisconnectHook(fn, log, onError);

    expect(fn).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("disconnect", "onDisconnect callback completed");
  });

  it("catches errors and forwards them to onError", async () => {
    const err = new Error("teardown failed");
    const fn = vi.fn().mockRejectedValue(err);

    await runDisconnectHook(fn, log, onError);

    expect(onError).toHaveBeenCalledWith(err);
    expect(log).toHaveBeenCalledWith("disconnect", `onDisconnect callback error: ${err}`);
  });

  it("catches synchronous throws and forwards them to onError", async () => {
    const err = new Error("sync boom");
    const fn = () => {
      throw err;
    };

    await runDisconnectHook(fn, log, onError);

    expect(onError).toHaveBeenCalledWith(err);
  });
});
