import { RunloopSDK } from "@runloop/api-client";
import { ACPAxonConnection, PROTOCOL_VERSION } from "@runloop/agent-axon-client/acp";
import { ClaudeAxonConnection } from "@runloop/agent-axon-client/claude";
import type { AgentConfig, UseCase, RunContext } from "./types.js";
import { SkipError } from "./types.js";

interface SetupResult {
  ctx: RunContext;
  sdk: RunloopSDK;
}

/**
 * Provision a devbox and initialize a connection for the given agent and use case.
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
  if (agent.name === "claude-acp" && !anthropicApiKey) {
    throw new SkipError("ANTHROPIC_API_KEY not set (required for claude-acp)");
  }

  const sdk = new RunloopSDK({ bearerToken: runloopApiKey });

  const mergedAgent = mergeOverrides(agent, useCase.provisionOverrides);

  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(`[${agent.name}/${useCase.name}] ${msg}`);
  };

  log("Creating Axon channel...");
  const axon = await sdk.axon.create({ name: `${useCase.name}-${agent.name}` });

  log("Creating devbox...");
  const envVars: Record<string, string> = { ...mergedAgent.env };
  if (anthropicApiKey && mergedAgent.env?.ANTHROPIC_API_KEY !== undefined) {
    envVars.ANTHROPIC_API_KEY = anthropicApiKey;
  }

  const devbox = await sdk.devbox.create({
    name: `${useCase.name}-${agent.name}`,
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
    environment_variables: Object.keys(envVars).length > 0 ? envVars : undefined,
  });
  log(`Devbox ready: ${devbox.id}`);

  const cleanup = async () => {
    log("Shutting down devbox...");
    await devbox.shutdown();
  };

  if (mergedAgent.protocol === "acp") {
    const conn = new ACPAxonConnection(axon, devbox);

    log("Connecting (ACP)...");
    await conn.connect();

    log("Initializing (ACP)...");
    await conn.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "agent-examples", version: "0.0.0" },
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
