import { describe, expect, it, vi } from "vitest";
import { makeDefaultOnError, makeLogger } from "./logging.js";

describe("makeDefaultOnError", () => {
  it("logs to console.error with the given label", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = makeDefaultOnError("TestLabel");

    handler("something went wrong");

    expect(spy).toHaveBeenCalledWith("[TestLabel]", "something went wrong");
    spy.mockRestore();
  });
});

describe("makeLogger", () => {
  it("returns a no-op when verbose is false", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = makeLogger("prefix", false);

    log("tag", "should not appear");

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs to console.error with timestamp and prefix when verbose is true", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = makeLogger("myprefix", true);

    log("init", "hello", 42);

    expect(spy).toHaveBeenCalledOnce();
    const [timestamp, ...rest] = spy.mock.calls[0];
    expect(timestamp).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[myprefix:init\]$/);
    expect(rest).toEqual(["hello", 42]);
    spy.mockRestore();
  });
});
