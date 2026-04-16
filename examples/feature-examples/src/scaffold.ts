import { RunloopSDK, type Secret, type NetworkPolicy } from "@runloop/api-client";
import { ACPAxonConnection, PROTOCOL_VERSION } from "@runloop/agent-axon-client/acp";
import { ClaudeAxonConnection } from "@runloop/agent-axon-client/claude";
import type { AgentConfig, UseCase, RunContext } from "./types.js";
import { SkipError } from "./types.js";
import { withTimeout } from "./validator.js";

interface SetupResult {
  ctx: RunContext;
  sdk: RunloopSDK;
}

const DEFAULT_WORKING_DIRECTORY = "/home/user";
const SETUP_STEP_TIMEOUT_MS = 30_000;
const SETUP_ERROR_CLEANUP_TIMEOUT_MS = 10_000;

/**
 * Provision a devbox with secrets and network policy, then initialize a connection.
 * See inline comments for best-practice patterns.
 */
export async function setup(agent: AgentConfig, useCase: UseCase): Promise<SetupResult> {
  const runloopApiKey = process.env.RUNLOOP_API_KEY;
  if (!runloopApiKey) {
    throw new SkipError("RUNLOOP_API_KEY not set");
  }

  const sdk = new RunloopSDK({ bearerToken: runloopApiKey });

  const mergedAgent = mergeOverrides(agent, useCase.provisionOverrides);

  // Validate that all required secrets are available in the local environment.
  const secretsConfig = mergedAgent.secrets ?? {};
  for (const [devboxEnv, localEnv] of Object.entries(secretsConfig)) {
    if (!process.env[localEnv]) {
      throw new SkipError(`${localEnv} not set (required for ${mergedAgent.name})`);
    }
  }

  const log = (msg: string) => {
    console.log(`[${agent.name}/${useCase.name}] ${msg}`);
  };

  // Unique prefix with timestamp to avoid collisions in parallel runs.
  const timestamp = Date.now().toString(36);
  const resourcePrefix = `${useCase.name}-${agent.name}-${timestamp}`;

  log("Creating Axon channel...");
  const axon = await sdk.axon.create({ name: resourcePrefix });

  // Create Runloop secrets for each entry in the agent's secrets config.
  const createdSecrets: Secret[] = [];
  const devboxSecretsMap: Record<string, string> = {};
  for (const [devboxEnv, localEnv] of Object.entries(secretsConfig)) {
    const value = process.env[localEnv]!;
    log(`Creating secret for ${devboxEnv}...`);
    const secret = await sdk.secret.create({
      name: `${resourcePrefix}-${devboxEnv.toLowerCase()}`,
      value,
    });
    createdSecrets.push(secret);
    devboxSecretsMap[devboxEnv] = secret.name;
  }

  // Apply a network policy. Use allowed_hostnames in production for tighter control.
  log("Creating network policy...");
  const networkPolicy: NetworkPolicy = await sdk.networkPolicy.create({
    name: `${resourcePrefix}-policy`,
    allow_all: true,
  });

  log("Creating devbox...");
  const devbox = await sdk.devbox.create({
    name: resourcePrefix,
    blueprint_name: mergedAgent.blueprint,
    mounts: [
      {
        type: "broker_mount",
        axon_id: axon.id,
        protocol: mergedAgent.mount.protocol,
        ...(mergedAgent.mount.agent_binary && { agent_binary: mergedAgent.mount.agent_binary }),
        ...(mergedAgent.mount.launch_args && { launch_args: mergedAgent.mount.launch_args }),
        ...(mergedAgent.mount.working_directory && {
          working_directory: mergedAgent.mount.working_directory,
        }),
      },
    ],
    ...(Object.keys(devboxSecretsMap).length > 0 && { secrets: devboxSecretsMap }),
    launch_parameters: {
      network_policy_id: networkPolicy.id,
    },
  });
  log(`Devbox ready: ${devbox.id}`);

  // Cleanup: delete secrets and policy after devbox shutdown (for example only).
  const cleanup = async () => {
    log("Shutting down devbox...");
    await devbox.shutdown();

    for (const secret of createdSecrets) {
      log(`Deleting secret ${secret.name}...`);
      try {
        await secret.delete();
      } catch (err) {
        log(`Failed to delete secret (continuing): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    log("Deleting network policy...");
    try {
      await networkPolicy.delete();
    } catch (err) {
      log(`Failed to delete network policy (continuing): ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  try {
    if (mergedAgent.protocol === "acp") {
      const conn = new ACPAxonConnection(axon, devbox, {
        createClient: useCase.createClient,
      });

      log("Connecting (ACP)...");
      await withTimeout(conn.connect(), SETUP_STEP_TIMEOUT_MS, "ACP connect");

      log("Initializing (ACP)...");
      await withTimeout(
        conn.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: "feature-examples", version: "0.1.0" },
          ...(useCase.clientCapabilities ? { clientCapabilities: useCase.clientCapabilities } : {}),
        }),
        SETUP_STEP_TIMEOUT_MS,
        "ACP initialize",
      );

      // Some ACP agents (e.g. codex-acp) require `authenticate()` before `newSession()`.
      if (mergedAgent.acpAuthMethodId) {
        log(`Authenticating (ACP: ${mergedAgent.acpAuthMethodId})...`);
        await withTimeout(
          conn.authenticate({ methodId: mergedAgent.acpAuthMethodId }),
          SETUP_STEP_TIMEOUT_MS,
          `ACP authenticate (${mergedAgent.acpAuthMethodId})`,
        );
      }

      log("Creating session...");
      const session = await withTimeout(
        conn.newSession({
          cwd: mergedAgent.mount.working_directory ?? DEFAULT_WORKING_DIRECTORY,
          mcpServers: [],
        }),
        SETUP_STEP_TIMEOUT_MS,
        "ACP newSession",
      );
      log(`Session ready: ${session.sessionId}`);

      const ctx: RunContext = {
        agent: mergedAgent,
        acp: conn,
        claude: null,
        sessionId: session.sessionId,
        log,
        skip: (reason: string) => {
          throw new SkipError(reason);
        },
        cleanup,
      };

      return { ctx, sdk };
    }

    const conn = new ClaudeAxonConnection(axon, devbox);

    log("Connecting (Claude)...");
    await withTimeout(conn.connect(), SETUP_STEP_TIMEOUT_MS, "Claude connect");

    log("Initializing (Claude)...");
    await withTimeout(conn.initialize(), SETUP_STEP_TIMEOUT_MS, "Claude initialize");

    const ctx: RunContext = {
      agent: mergedAgent,
      acp: null,
      claude: conn,
      sessionId: null,
      log,
      skip: (reason: string) => {
        throw new SkipError(reason);
      },
      cleanup,
    };

    return { ctx, sdk };
  } catch (err) {
    await cleanupAfterSetupError(cleanup, log);
    throw err;
  }
}

/**
 * Disconnect the connection (transport only, no devbox shutdown).
 */
export async function disconnect(ctx: RunContext): Promise<void> {
  if (ctx.acp) {
    ctx.log("Disconnecting ACP...");
    await ctx.acp.disconnect();
  } else if (ctx.claude) {
    ctx.log("Disconnecting Claude...");
    await ctx.claude.disconnect();
  }
}

/**
 * Shut down the devbox.
 */
export async function cleanup(ctx: RunContext): Promise<void> {
  await ctx.cleanup();
}

async function cleanupAfterSetupError(
  cleanupFn: () => Promise<void>,
  log: (msg: string) => void,
): Promise<void> {
  try {
    await withTimeout(cleanupFn(), SETUP_ERROR_CLEANUP_TIMEOUT_MS, "setup cleanup");
  } catch (cleanupErr) {
    log(
      `Cleanup timeout/error after setup failure (continuing): ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
    );
  }
}

function mergeOverrides(
  agent: AgentConfig,
  overrides?: Partial<AgentConfig>,
): AgentConfig {
  if (!overrides) return agent;

  return {
    ...agent,
    ...overrides,
    mount: {
      ...agent.mount,
      ...overrides.mount,
    },
    env: {
      ...agent.env,
      ...overrides.env,
    },
    secrets: {
      ...agent.secrets,
      ...overrides.secrets,
    },
  };
}
