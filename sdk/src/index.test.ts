import { describe, expect, it } from "vitest";
import * as SDK from "./index.js";

describe("root exports", () => {
  it("exports an acp namespace", () => {
    expect(SDK.acp).toBeDefined();
    expect(typeof SDK.acp).toBe("object");
  });

  it("exports a claude namespace", () => {
    expect(SDK.claude).toBeDefined();
    expect(typeof SDK.claude).toBe("object");
  });

  it("acp namespace contains ACPAxonConnection", () => {
    expect(SDK.acp.ACPAxonConnection).toBeDefined();
  });

  it("acp namespace contains type guard functions", () => {
    expect(typeof SDK.acp.isUserMessageChunk).toBe("function");
    expect(typeof SDK.acp.isToolCall).toBe("function");
  });

  it("claude namespace contains ClaudeAxonConnection", () => {
    expect(SDK.claude.ClaudeAxonConnection).toBeDefined();
  });

  it("claude namespace contains AxonTransport", () => {
    expect(SDK.claude.AxonTransport).toBeDefined();
  });
});
