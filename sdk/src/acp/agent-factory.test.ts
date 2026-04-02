import { describe, expect, it, vi } from "vitest";
import { createAxonAgent } from "./agent-factory.js";
import { ACPAxonConnection } from "./connection.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createControllableStream() {
  return {
    [Symbol.asyncIterator](): AsyncIterator<never> {
      return {
        next: () => new Promise<IteratorResult<never>>(() => {}),
      };
    },
  };
}

function createMockSDK() {
  const mockAxon = {
    id: "axon-test-id",
    subscribeSse: vi.fn().mockResolvedValue(createControllableStream()),
    publish: vi.fn().mockResolvedValue(undefined),
  };

  const mockDevbox = {
    id: "devbox-test-id",
    shutdown: vi.fn().mockResolvedValue(undefined),
  };

  return {
    sdk: {
      axon: {
        create: vi.fn().mockResolvedValue(mockAxon),
      },
      devbox: {
        create: vi.fn().mockResolvedValue(mockDevbox),
      },
    },
    mockAxon,
    mockDevbox,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createAxonAgent", () => {
  it("creates an Axon channel with name 'acp-transport'", async () => {
    const { sdk } = createMockSDK();

    const conn = await createAxonAgent(sdk as never, { agentBinary: "opencode" });

    expect(sdk.axon.create).toHaveBeenCalledWith({ name: "acp-transport" });
    conn.disconnect();
  });

  it("creates a devbox with broker mount containing agent binary and config", async () => {
    const { sdk } = createMockSDK();

    const conn = await createAxonAgent(sdk as never, {
      agentBinary: "claude",
      launchArgs: ["--model", "sonnet"],
    });

    expect(sdk.devbox.create).toHaveBeenCalledWith({
      mounts: [
        {
          type: "broker_mount",
          axon_id: "axon-test-id",
          protocol: "acp",
          agent_binary: "claude",
          launch_args: ["--model", "sonnet"],
        },
      ],
      launch_parameters: undefined,
    });
    conn.disconnect();
  });

  it("sets launch_parameters with keep_alive when launchCommands provided", async () => {
    const { sdk } = createMockSDK();

    const conn = await createAxonAgent(sdk as never, {
      agentBinary: "opencode",
      launchCommands: ["npm install", "npm run build"],
    });

    expect(sdk.devbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        launch_parameters: {
          launch_commands: ["npm install", "npm run build"],
          keep_alive_time_seconds: 300,
        },
      }),
    );
    conn.disconnect();
  });

  it("passes devboxConfig fields (e.g. blueprint_id, environment_variables) to devbox.create", async () => {
    const { sdk } = createMockSDK();

    const conn = await createAxonAgent(
      sdk as never,
      { agentBinary: "opencode" },
      {
        blueprint_id: "bpt_custom",
        environment_variables: { MY_VAR: "hello" },
      },
    );

    expect(sdk.devbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        blueprint_id: "bpt_custom",
        environment_variables: { MY_VAR: "hello" },
      }),
    );
    conn.disconnect();
  });

  it("devboxConfig.launch_parameters is used when launchCommands not set", async () => {
    const { sdk } = createMockSDK();

    const conn = await createAxonAgent(
      sdk as never,
      { agentBinary: "opencode" },
      {
        launch_parameters: { keep_alive_time_seconds: 600 },
      },
    );

    expect(sdk.devbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        launch_parameters: { keep_alive_time_seconds: 600 },
      }),
    );
    conn.disconnect();
  });

  it("config.launchCommands takes precedence over devboxConfig.launch_parameters", async () => {
    const { sdk } = createMockSDK();

    const conn = await createAxonAgent(
      sdk as never,
      { agentBinary: "opencode", launchCommands: ["npm install"] },
      { launch_parameters: { keep_alive_time_seconds: 600 } },
    );

    expect(sdk.devbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        launch_parameters: {
          launch_commands: ["npm install"],
          keep_alive_time_seconds: 300,
        },
      }),
    );
    conn.disconnect();
  });

  it("returns an ACPAxonConnection with correct axonId and devboxId", async () => {
    const { sdk } = createMockSDK();

    const conn = await createAxonAgent(sdk as never, { agentBinary: "opencode" });

    expect(conn).toBeInstanceOf(ACPAxonConnection);
    expect(conn.axonId).toBe("axon-test-id");
    expect(conn.devboxId).toBe("devbox-test-id");
    conn.disconnect();
  });

  it("shutdown() shuts down the devbox", async () => {
    const { sdk, mockDevbox } = createMockSDK();

    const conn = await createAxonAgent(sdk as never, { agentBinary: "opencode" });

    await conn.shutdown();

    expect(mockDevbox.shutdown).toHaveBeenCalledOnce();
  });

  it("passes connectionOptions through to the connection", async () => {
    const { sdk } = createMockSDK();
    const customPermHandler = vi.fn();
    const customOnError = vi.fn();

    const conn = await createAxonAgent(sdk as never, { agentBinary: "opencode" }, undefined, {
      requestPermission: customPermHandler,
      onError: customOnError,
    });

    expect(conn).toBeInstanceOf(ACPAxonConnection);
    conn.disconnect();
  });
});
