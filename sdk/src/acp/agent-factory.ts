import type { RunloopSDK, SDKDevboxCreateParams } from "@runloop/api-client";
import { AxonACPConnection } from "./connection.js";
import type { AgentLaunchConfig, AxonACPConnectionOptions } from "./types.js";

/**
 * Creates an Axon-backed ACP agent: provisions an Axon channel, launches a
 * Runloop devbox with the broker mount, and returns a connected
 * {@link AxonACPConnection}.
 *
 * The returned connection has `shutdown()` pre-wired to disconnect the stream
 * and shut down the devbox. The `devboxId` and `axonId` are available as
 * properties on the connection.
 *
 * @param sdk - A `RunloopSDK` instance for provisioning infrastructure.
 * @param config - Agent binary and launch configuration.
 * @param connectionOptions - Optional overrides for the ACP connection
 *   (e.g. custom `requestPermission` handler or `onError` callback).
 * @param devboxConfig - Optional overrides passed directly to `sdk.devbox.create`
 *   (e.g. `blueprint_id`, `environment_variables`, `metadata`). The `mounts`
 *   field is managed internally and cannot be overridden here.
 */
export async function createAxonAgent(
  sdk: RunloopSDK,
  config: AgentLaunchConfig,
  devboxConfig?: Omit<SDKDevboxCreateParams, "mounts">,
  connectionOptions?: Pick<
    AxonACPConnectionOptions,
    "requestPermission" | "onError" | "onDisconnect"
  >,
): Promise<AxonACPConnection> {
  const axon = await sdk.axon.create({ name: "acp-transport" });

  const devbox = await sdk.devbox.create({
    ...devboxConfig,
    mounts: [
      {
        type: "broker_mount",
        axon_id: axon.id,
        protocol: "acp",
        agent_binary: config.agentBinary,
        launch_args: config.launchArgs,
      },
    ],
    launch_parameters: config.launchCommands
      ? {
          launch_commands: config.launchCommands,
          keep_alive_time_seconds: 60 * 5,
        }
      : devboxConfig?.launch_parameters,
  });

  return new AxonACPConnection({
    axon,
    devboxId: devbox.id,
    shutdown: async () => {
      await devbox.shutdown();
    },
    ...connectionOptions,
  });
}
