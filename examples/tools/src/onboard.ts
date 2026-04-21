/**
 * ACP Agent Onboarding Runner
 *
 * A reusable onboarding workflow for ACP agents that exposes explicit checkpoints
 * at each setup stage: connect, initialize, authenticate, newSession, and prompt.
 *
 * Usage:
 *   bun run onboard --agent qwen
 *   bun run onboard --agent qwen --pause-after initialize
 *   bun run onboard --agent qwen --pause-after authenticate
 */

import { parseArgs } from "util";
import { createInterface } from "readline";
import { RunloopSDK, type Secret } from "@runloop/api-client";
import {
  ACPAxonConnection,
  PROTOCOL_VERSION,
  isAgentTextChunk,
  isThoughtTextChunk,
  type InitializeResponse,
} from "@runloop/agent-axon-client/acp";
import type { Axon, Devbox } from "@runloop/api-client/sdk";
import type { AgentConfig, BrokerMount } from "feature-examples/types";
import { AGENTS } from "feature-examples/agents";
import { withTimeout, waitFor } from "feature-examples/validator";

// ---------------------------------------------------------------------------
// Stage definitions
// ---------------------------------------------------------------------------

/**
 * Onboarding stages in execution order.
 */
const STAGES = ["devbox", "connect", "initialize", "authenticate", "newSession", "prompt"] as const;
type Stage = (typeof STAGES)[number];

/**
 * Stage-specific error class for clear failure attribution.
 */
export class OnboardingStageError extends Error {
  readonly stage: Stage;
  readonly agentName: string;

  constructor(stage: Stage, agentName: string, message: string, options?: ErrorOptions) {
    super(`[${stage}] ${message}`, options);
    this.name = "OnboardingStageError";
    this.stage = stage;
    this.agentName = agentName;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WORKING_DIRECTORY = "/home/user";
const SETUP_STEP_TIMEOUT_MS = 30_000;
const DEVBOX_PROVISION_TIMEOUT_MS = 180_000;
const PROMPT_TEXT = "Say hello world";
const CHUNK_WAIT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toErrMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function log(agentName: string, stage: Stage | "cleanup", msg: string): void {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.log(`[${timestamp}] [${agentName}/${stage}] ${msg}`);
}

function logSection(title: string): void {
  console.log("\n" + "=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
}

function logSubsection(title: string): void {
  console.log("\n" + "-".repeat(50));
  console.log(title);
  console.log("-".repeat(50));
}

async function promptToContinue(stage: Stage): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\nPaused after '${stage}'. Press Enter to continue (or Ctrl+C to exit)... `, () => {
      rl.close();
      resolve();
    });
  });
}

function printHelp(): void {
  console.log(`
ACP Agent Onboarding Runner

Usage: bun run onboard [options]

Options:
  --agent <name>        Agent to onboard (required)
  --pause-after <stage> Pause after this stage for inspection
                        Stages: ${STAGES.join(", ")}
  --skip-prompt         Skip the prompt stage (useful for auth debugging)
  --help                Show help

Examples:
  bun run onboard --agent qwen                          # Full onboarding run
  bun run onboard --agent qwen --pause-after initialize # Pause to inspect auth methods
  bun run onboard --agent qwen --pause-after authenticate --skip-prompt
`);
}

// ---------------------------------------------------------------------------
// Provisioning helpers (from scaffold.ts, factored for reuse)
// ---------------------------------------------------------------------------

function validateConfig(agent: AgentConfig): void {
  const expectedBrokerProtocol = agent.protocol === "acp" ? "acp" : "claude_json";
  if (agent.brokerMount.protocol !== expectedBrokerProtocol) {
    throw new Error(
      `Config error for ${agent.name}: protocol "${agent.protocol}" expects brokerMount.protocol "${expectedBrokerProtocol}", got "${agent.brokerMount.protocol}"`,
    );
  }
}

function buildBrokerMount(
  axonId: string,
  config: BrokerMount,
): {
  type: "broker_mount";
  axon_id: string;
  protocol: "acp" | "claude_json";
  agent_binary?: string;
  launch_args?: string[];
  working_directory?: string;
} {
  return {
    type: "broker_mount" as const,
    axon_id: axonId,
    protocol: config.protocol,
    ...(config.agentBinary && { agent_binary: config.agentBinary }),
    ...(config.launchArgs && { launch_args: config.launchArgs }),
    ...(config.workingDirectory && { working_directory: config.workingDirectory }),
  };
}

function buildDevboxMounts(
  axonId: string,
  agent: AgentConfig,
): Array<
  | { type: "agent_mount"; agent_id: null; agent_name: string }
  | {
      type: "broker_mount";
      axon_id: string;
      protocol: "acp" | "claude_json";
      agent_binary?: string;
      launch_args?: string[];
      working_directory?: string;
    }
> {
  const brokerMount = buildBrokerMount(axonId, agent.brokerMount);

  if (agent.install.kind === "agent-mount") {
    const agentMount = {
      type: "agent_mount" as const,
      agent_id: null,
      agent_name: agent.install.agentName,
    };
    return [agentMount, brokerMount];
  }

  return [brokerMount];
}

// ---------------------------------------------------------------------------
// Onboarding context
// ---------------------------------------------------------------------------

interface OnboardContext {
  agent: AgentConfig;
  sdk: RunloopSDK;
  axon: Axon | null;
  devbox: Devbox | null;
  conn: ACPAxonConnection | null;
  createdSecrets: Secret[];
  sessionId: string | null;
  initializeResponse: InitializeResponse | null;
}

async function cleanup(ctx: OnboardContext): Promise<void> {
  log(ctx.agent.name, "cleanup", "Starting cleanup...");

  if (ctx.conn) {
    try {
      log(ctx.agent.name, "cleanup", "Disconnecting ACP connection...");
      await ctx.conn.disconnect();
    } catch (err) {
      log(ctx.agent.name, "cleanup", `Disconnect error (continuing): ${err}`);
    }
  }

  if (ctx.devbox) {
    try {
      log(ctx.agent.name, "cleanup", "Shutting down devbox...");
      await ctx.devbox.shutdown();
    } catch (err) {
      log(ctx.agent.name, "cleanup", `Devbox shutdown error (continuing): ${err}`);
    }
  }

  if (ctx.axon) {
    log(ctx.agent.name, "cleanup", `TODO: Update me to delete the Axon with ID: ${ctx.axon.id}.`);
  }

  for (const secret of ctx.createdSecrets) {
    try {
      log(ctx.agent.name, "cleanup", `Deleting secret ${secret.name}...`);
      await secret.delete();
    } catch (err) {
      log(ctx.agent.name, "cleanup", `Secret delete error (continuing): ${err}`);
    }
  }

  log(ctx.agent.name, "cleanup", "Cleanup complete.");
}

// ---------------------------------------------------------------------------
// Stage runners
// ---------------------------------------------------------------------------

async function runDevboxStage(ctx: OnboardContext): Promise<void> {
  const { agent, sdk } = ctx;

  log(agent.name, "devbox", "Validating configuration...");
  validateConfig(agent);

  log(agent.name, "devbox", "Validating required secrets...");
  const secretsConfig = agent.secrets ?? {};
  for (const [devboxEnv, localEnv] of Object.entries(secretsConfig)) {
    if (!process.env[localEnv]) {
      throw new OnboardingStageError(
        "devbox",
        agent.name,
        `Environment variable ${localEnv} not set (required for ${devboxEnv})`,
      );
    }
    log(agent.name, "devbox", `  ${devboxEnv} <- ${localEnv} (set)`);
  }

  const timestamp = Date.now().toString(36);
  const resourcePrefix = `onboard-${agent.name}-${timestamp}`;

  log(agent.name, "devbox", "Creating Axon channel...");
  ctx.axon = await sdk.axon.create({ name: resourcePrefix });
  log(agent.name, "devbox", `  Axon ID: ${ctx.axon.id}`);

  log(agent.name, "devbox", "Creating Runloop secrets...");
  const devboxSecretsMap: Record<string, string> = {};
  for (const [devboxEnv, localEnv] of Object.entries(secretsConfig)) {
    const value = process.env[localEnv]!;
    const secret = await sdk.secret.create({
      name: `${resourcePrefix}-${devboxEnv.toLowerCase()}`,
      value,
    });
    ctx.createdSecrets.push(secret);
    devboxSecretsMap[devboxEnv] = secret.name;
    log(agent.name, "devbox", `  Created secret for ${devboxEnv}`);
  }

  const mounts = buildDevboxMounts(ctx.axon.id, agent);

  log(agent.name, "devbox", "Creating devbox...");
  log(agent.name, "devbox", `  Blueprint: ${agent.install.blueprint}`);
  log(agent.name, "devbox", `  Agent binary: ${agent.brokerMount.agentBinary ?? "(default)"}`);
  log(agent.name, "devbox", `  Launch args: ${JSON.stringify(agent.brokerMount.launchArgs ?? [])}`);

  try {
    ctx.devbox = await sdk.devbox.create(
      {
        name: resourcePrefix,
        blueprint_name: agent.install.blueprint,
        mounts,
        ...(Object.keys(devboxSecretsMap).length > 0 && { secrets: devboxSecretsMap }),
        launch_parameters: {
          keep_alive_time_seconds: 300,
        },
      },
      { longPoll: { timeoutMs: DEVBOX_PROVISION_TIMEOUT_MS } },
    );
    log(agent.name, "devbox", `  Devbox ID: ${ctx.devbox.id}`);
  } catch (err) {
    throw new OnboardingStageError(
      "devbox",
      agent.name,
      `Failed to provision devbox: ${toErrMsg(err)}`,
      { cause: err },
    );
  }
}

async function runConnectStage(ctx: OnboardContext): Promise<void> {
  const { agent, axon, devbox } = ctx;
  if (!axon || !devbox) {
    throw new OnboardingStageError("connect", agent.name, "Missing axon or devbox from previous stage");
  }

  log(agent.name, "connect", "Creating ACP connection...");
  ctx.conn = new ACPAxonConnection(axon, devbox, {
    verbose: true,
  });

  log(agent.name, "connect", "Opening SSE subscription...");
  try {
    await withTimeout(ctx.conn.connect(), SETUP_STEP_TIMEOUT_MS, "ACP connect");
    log(agent.name, "connect", "SSE subscription opened successfully.");
  } catch (err) {
    throw new OnboardingStageError(
      "connect",
      agent.name,
      `Failed to connect: ${toErrMsg(err)}`,
      { cause: err },
    );
  }
}

async function runInitializeStage(ctx: OnboardContext): Promise<void> {
  const { agent, conn } = ctx;
  if (!conn) {
    throw new OnboardingStageError("initialize", agent.name, "Missing connection from previous stage");
  }

  log(agent.name, "initialize", "Sending ACP initialize request...");
  log(agent.name, "initialize", `  Protocol version: ${PROTOCOL_VERSION}`);

  try {
    ctx.initializeResponse = await withTimeout(
      conn.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "onboard-runner", version: "0.1.0" },
      }),
      SETUP_STEP_TIMEOUT_MS,
      "ACP initialize",
    );

    logSubsection("Initialize Response");
    console.log(JSON.stringify(ctx.initializeResponse, null, 2));

    logSubsection("Auth Methods Analysis");
    // authMethods may appear at the top level or nested under agentInfo depending on ACP version
    const response = ctx.initializeResponse as Record<string, unknown>;
    const agentInfo = response.agentInfo as Record<string, unknown> | undefined;
    const authMethods =
      (response.authMethods as unknown[] | undefined) ??
      (agentInfo?.authMethods as unknown[] | undefined) ??
      [];
    if (authMethods.length === 0) {
      console.log("  No auth methods found at response.authMethods or response.agentInfo.authMethods.");
      console.log("  -> authenticate() is likely not required.");
    } else {
      console.log(`  Agent advertises ${authMethods.length} auth method(s):`);
      for (const method of authMethods) {
        const methodId = typeof method === "string" ? method : (method as { id?: string }).id ?? JSON.stringify(method);
        console.log(`    - ${methodId}`);
      }

      if (agent.acpAuthMethodId) {
        const configuredMethodExists = authMethods.some((m: unknown) => {
          const id = typeof m === "string" ? m : (m as { id?: string }).id;
          return id === agent.acpAuthMethodId;
        });
        if (configuredMethodExists) {
          console.log(`\n  Configured acpAuthMethodId "${agent.acpAuthMethodId}" MATCHES an advertised method.`);
        } else {
          console.log(`\n  WARNING: Configured acpAuthMethodId "${agent.acpAuthMethodId}" does NOT match any advertised method!`);
          console.log("  -> This will likely cause authenticate() to fail.");
          console.log("  -> Update agents.ts with a valid methodId from the list above.");
        }
      } else {
        console.log("\n  No acpAuthMethodId configured for this agent.");
        console.log("  -> If auth is required, add acpAuthMethodId to agents.ts");
      }
    }
  } catch (err) {
    throw new OnboardingStageError(
      "initialize",
      agent.name,
      `Failed to initialize: ${toErrMsg(err)}`,
      { cause: err },
    );
  }
}

async function runAuthenticateStage(ctx: OnboardContext): Promise<void> {
  const { agent, conn } = ctx;
  if (!conn) {
    throw new OnboardingStageError("authenticate", agent.name, "Missing connection from previous stage");
  }

  if (!agent.acpAuthMethodId) {
    log(agent.name, "authenticate", "No acpAuthMethodId configured - skipping authenticate().");
    log(agent.name, "authenticate", "  (If newSession fails, this might need to change.)");
    return;
  }

  log(agent.name, "authenticate", `Authenticating with methodId: ${agent.acpAuthMethodId}`);

  try {
    const authResponse = await withTimeout(
      conn.authenticate({ methodId: agent.acpAuthMethodId }),
      SETUP_STEP_TIMEOUT_MS,
      `ACP authenticate (${agent.acpAuthMethodId})`,
    );

    logSubsection("Authenticate Response");
    console.log(JSON.stringify(authResponse, null, 2));
    log(agent.name, "authenticate", "Authentication successful.");
  } catch (err) {
    throw new OnboardingStageError(
      "authenticate",
      agent.name,
      `Failed to authenticate: ${toErrMsg(err)}\n` +
        `  Configured methodId: ${agent.acpAuthMethodId}\n` +
        `  Check that this matches an authMethod advertised during initialize().`,
      { cause: err },
    );
  }
}

async function runNewSessionStage(ctx: OnboardContext): Promise<void> {
  const { agent, conn } = ctx;
  if (!conn) {
    throw new OnboardingStageError("newSession", agent.name, "Missing connection from previous stage");
  }

  const cwd = agent.brokerMount.workingDirectory ?? DEFAULT_WORKING_DIRECTORY;
  log(agent.name, "newSession", `Creating session with cwd: ${cwd}`);

  try {
    const session = await withTimeout(
      conn.newSession({
        cwd,
        mcpServers: [],
      }),
      SETUP_STEP_TIMEOUT_MS,
      "ACP newSession",
    );

    ctx.sessionId = session.sessionId;
    logSubsection("New Session Response");
    console.log(JSON.stringify(session, null, 2));
    log(agent.name, "newSession", `Session created: ${session.sessionId}`);
  } catch (err) {
    throw new OnboardingStageError(
      "newSession",
      agent.name,
      `Failed to create session: ${toErrMsg(err)}\n` +
        `  If authenticate() was skipped but the agent requires it, add acpAuthMethodId to agents.ts.`,
      { cause: err },
    );
  }
}

async function runPromptStage(ctx: OnboardContext): Promise<void> {
  const { agent, conn, sessionId } = ctx;
  if (!conn || !sessionId) {
    throw new OnboardingStageError("prompt", agent.name, "Missing connection or sessionId from previous stage");
  }

  log(agent.name, "prompt", `Sending prompt: "${PROMPT_TEXT}"`);

  const chunks: string[] = [];
  // Count thought chunks as text so agents that only stream thoughts are not treated as silent
  const unsub = conn.onSessionUpdate((_sid, update) => {
    if (isAgentTextChunk(update) || isThoughtTextChunk(update)) {
      chunks.push(update.content.text);
    }
  });

  try {
    await conn.prompt({
      sessionId,
      prompt: [{ type: "text", text: PROMPT_TEXT }],
    });

    const hasText = () => chunks.some((c) => c.trim().length > 0);
    const textReceived = await waitFor(hasText, CHUNK_WAIT_MS);
    unsub();

    logSubsection("Prompt Response");
    if (!textReceived) {
      console.log("  No text chunks received within timeout.");
      throw new OnboardingStageError(
        "prompt",
        agent.name,
        `Timed out waiting for agent text after ${CHUNK_WAIT_MS}ms — no text or thought chunks arrived`,
      );
    }

    console.log(`  Received ${chunks.length} text chunk(s):`);
    const fullResponse = chunks.join("");
    console.log(`  Response: ${fullResponse.slice(0, 200)}${fullResponse.length > 200 ? "..." : ""}`);
    log(agent.name, "prompt", "Prompt completed successfully.");
  } catch (err) {
    unsub();
    if (err instanceof OnboardingStageError) throw err;
    throw new OnboardingStageError(
      "prompt",
      agent.name,
      `Failed during prompt: ${toErrMsg(err)}`,
      { cause: err },
    );
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

interface OnboardOptions {
  agent: AgentConfig;
  pauseAfter?: Stage;
  skipPrompt: boolean;
}

async function runOnboarding(options: OnboardOptions): Promise<void> {
  const { agent, pauseAfter, skipPrompt } = options;

  logSection(`Onboarding: ${agent.name}`);
  console.log(`Protocol: ${agent.protocol}`);
  console.log(`acpAuthMethodId: ${agent.acpAuthMethodId ?? "(none)"}`);
  console.log(`Secrets required: ${Object.keys(agent.secrets ?? {}).join(", ") || "(none)"}`);
  if (pauseAfter) console.log(`Pause after: ${pauseAfter}`);
  if (skipPrompt) console.log(`Skip prompt: yes`);

  const runloopApiKey = process.env.RUNLOOP_API_KEY;
  if (!runloopApiKey) {
    throw new OnboardingStageError("devbox", agent.name, "RUNLOOP_API_KEY environment variable not set");
  }

  const ctx: OnboardContext = {
    agent,
    sdk: new RunloopSDK({ bearerToken: runloopApiKey }),
    axon: null,
    devbox: null,
    conn: null,
    createdSecrets: [],
    sessionId: null,
    initializeResponse: null,
  };

  const stageRunners: Record<Stage, () => Promise<void>> = {
    devbox: () => runDevboxStage(ctx),
    connect: () => runConnectStage(ctx),
    initialize: () => runInitializeStage(ctx),
    authenticate: () => runAuthenticateStage(ctx),
    newSession: () => runNewSessionStage(ctx),
    prompt: () => runPromptStage(ctx),
  };

  let lastCompletedStage: Stage | null = null;

  try {
    for (const stage of STAGES) {
      if (skipPrompt && stage === "prompt") {
        log(agent.name, stage, "Skipping prompt stage (--skip-prompt)");
        continue;
      }

      logSection(`Stage: ${stage}`);
      await stageRunners[stage]();
      lastCompletedStage = stage;
      log(agent.name, stage, "Stage completed successfully.");

      if (pauseAfter === stage) {
        await promptToContinue(stage);
      }
    }

    logSection("Onboarding Complete");
    console.log(`All stages passed for ${agent.name}.`);
    console.log("\nNext steps:");
    console.log("  1. Run: bun run feature-compat --agent " + agent.name + " --use-case single-prompt");
    console.log("  2. If that passes, run the full compatibility suite without filters.");
  } catch (err) {
    logSection("Onboarding Failed");

    if (err instanceof OnboardingStageError) {
      console.log(`Stage: ${err.stage}`);
      console.log(`Agent: ${err.agentName}`);
      console.log(`Error: ${err.message}`);
      if (err.cause) {
        console.log(`Cause: ${err.cause}`);
      }

      console.log("\nDiagnosis hints:");
      switch (err.stage) {
        case "devbox":
          console.log("  - Check RUNLOOP_API_KEY and agent-specific secrets are set");
          console.log("  - Verify the blueprint exists: " + agent.install.blueprint);
          console.log("  - Check agent mount name: " + (agent.install.kind === "agent-mount" ? agent.install.agentName : "N/A"));
          break;
        case "connect":
          console.log("  - The broker may have failed to start the agent process");
          console.log("  - Check agent binary: " + agent.brokerMount.agentBinary);
          console.log("  - Check launch args: " + JSON.stringify(agent.brokerMount.launchArgs ?? []));
          break;
        case "initialize":
          console.log("  - The agent may not speak ACP or has a protocol mismatch");
          console.log("  - Try running the agent manually to verify it starts");
          break;
        case "authenticate":
          console.log("  - The configured acpAuthMethodId may be wrong");
          console.log("  - Re-run with --pause-after initialize to see advertised auth methods");
          console.log("  - If no auth is needed, remove acpAuthMethodId from agents.ts");
          break;
        case "newSession":
          console.log("  - If authenticate() was skipped, the agent may require it");
          console.log("  - Add acpAuthMethodId to agents.ts if the agent requires authentication");
          break;
        case "prompt":
          console.log("  - Session was created but prompt failed");
          console.log("  - This may indicate an API key issue or agent-specific problem");
          break;
      }
    } else {
      console.log(`Unexpected error: ${err}`);
    }

    console.log(`\nLast completed stage: ${lastCompletedStage ?? "(none)"}`);
    throw err;
  } finally {
    await cleanup(ctx);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    args: process.argv.slice(2),
    options: {
      agent: { type: "string" },
      "pause-after": { type: "string" },
      "skip-prompt": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const availableAgents = AGENTS.map((a) => a.name).join(", ");

  if (!args.agent) {
    console.error("Error: --agent is required");
    console.error(`Available agents: ${availableAgents}`);
    process.exit(1);
  }

  const agent = AGENTS.find((a) => a.name === args.agent);
  if (!agent) {
    console.error(`Error: Unknown agent "${args.agent}"`);
    console.error(`Available agents: ${availableAgents}`);
    process.exit(1);
  }

  if (agent.protocol !== "acp") {
    console.error(`Error: Agent "${agent.name}" uses protocol "${agent.protocol}", but onboard only supports ACP agents.`);
    process.exit(1);
  }

  let pauseAfter: Stage | undefined;
  if (args["pause-after"]) {
    if (!STAGES.includes(args["pause-after"] as Stage)) {
      console.error(`Error: Invalid --pause-after value "${args["pause-after"]}"`);
      console.error(`Valid stages: ${STAGES.join(", ")}`);
      process.exit(1);
    }
    pauseAfter = args["pause-after"] as Stage;
  }

  try {
    await runOnboarding({
      agent,
      pauseAfter,
      skipPrompt: args["skip-prompt"] ?? false,
    });
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

main();
