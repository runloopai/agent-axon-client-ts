import { RunloopSDK, type Secret, type NetworkPolicy } from "@runloop/api-client";
import { ACPAxonConnection, PROTOCOL_VERSION } from "@runloop/agent-axon-client/acp";
import { ClaudeAxonConnection } from "@runloop/agent-axon-client/claude";
import type { AgentConfig, UseCase, RunContext } from "./types.js";
import { SkipError } from "./types.js";

interface SetupResult {
  ctx: RunContext;
  sdk: RunloopSDK;
}

/**
 * Provision a devbox with secrets and network policy, then initialize a connection.
 * See inline comments for best-practice patterns.
 */
export async function setup(agent: AgentConfig, useCase: UseCase): Promise<SetupResult> {
  const runloopApiKey = process.env.RUNLOOP_API_KEY;
  if (!runloopApiKey) {
    throw new SkipError("RUNLOOP_API_KEY not set");
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (agent.protocol === "claude" && !anthropicApiKey) {
    throw new SkipError("ANTHROPIC_API_KEY not set (required for Claude)");
  }

  const sdk = new RunloopSDK({ bearerToken: runloopApiKey });

  const mergedAgent = mergeOverrides(agent, useCase.provisionOverrides);

  const log = (msg: string) => {
    console.log(`[${agent.name}/${useCase.name}] ${msg}`);
  };

  // Unique prefix with timestamp to avoid collisions in parallel runs.
  const timestamp = Date.now().toString(36);
  const resourcePrefix = `${useCase.name}-${agent.name}-${timestamp}`;

  log("Creating Axon channel...");
  const axon = await sdk.axon.create({ name: resourcePrefix });

  // Store API keys as secrets, not environment_variables.
  let secret: Secret | null = null;
  if (anthropicApiKey && mergedAgent.protocol === "claude") {
    log("Creating secret for Anthropic API key...");
    secret = await sdk.secret.create({
      name: `${resourcePrefix}-anthropic-key`,
      value: anthropicApiKey,
    });
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
      },
    ],
    // Inject secret as env var. Values are never logged.
    ...(secret && {
      secrets: {
        ANTHROPIC_API_KEY: secret.name,
      },
    }),
    launch_parameters: {
      network_policy_id: networkPolicy.id,
    },
  });
  log(`Devbox ready: ${devbox.id}`);

  // Cleanup: delete secret and policy after devbox shutdown (for example only).
  const cleanup = async () => {
    log("Shutting down devbox...");
    await devbox.shutdown();

    if (secret) {
      log("Deleting secret...");
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

  if (mergedAgent.protocol === "acp") {
    const conn = new ACPAxonConnection(axon, devbox, {
      createClient: useCase.createClient,
    });

    log("Connecting (ACP)...");
    await conn.connect();

    log("Initializing (ACP)...");
    await conn.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "feature-examples", version: "0.1.0" },
      ...(useCase.clientCapabilities ? { clientCapabilities: useCase.clientCapabilities } : {}),
    });

    log("Creating session...");
    const session = await conn.newSession({ cwd: "/home/user", mcpServers: [] });
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
  } else {
    const conn = new ClaudeAxonConnection(axon, devbox);

    log("Connecting (Claude)...");
    await conn.connect();

    log("Initializing (Claude)...");
    await conn.initialize();

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
  };
}
