/**
 * Interactive CLI for ACP-compatible agents (e.g. OpenCode).
 *
 * Creates a Runloop Devbox + Axon session, connects via the ACP protocol,
 * and runs a REPL that streams session updates in real time.
 *
 * Usage:
 *   bun run acp-cli.ts
 *   bun run acp-cli.ts --agent opencode
 *   VERBOSE=1 bun run acp-cli.ts
 */

import { RunloopSDK } from "@runloop/api-client";
import { createInterface, type Interface } from "readline";
import {
  ACPAxonConnection,
  PROTOCOL_VERSION,
  isAgentMessageChunk,
  isAgentThoughtChunk,
  isToolCall,
  isToolCallProgress,
  isPlan,
  isUsageUpdate,
} from "@runloop/agent-axon-client/acp";
import { parseArgs } from "util";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    agent: { type: "string", default: "opencode" },
    verbose: { type: "boolean", default: false },
  },
});

const VERBOSE = args.verbose || !!process.env.VERBOSE;
const AGENT_BINARY = args.agent ?? "opencode";

// ---------------------------------------------------------------------------
// Session setup
// ---------------------------------------------------------------------------

const sdk = new RunloopSDK();

console.log(`Starting devbox with agent "${AGENT_BINARY}"...`);
// The runloop/agents blueprint used has opencode pre-installed.
// When using ACPAxonConnection, ensure the agent binary is on the blueprint
// (Agent API or custom blueprint).
const axon = await sdk.axon.create({ name: "acp-transport" });
const devbox = await sdk.devbox.create({
  name: "acp-cli",
  blueprint_name: "runloop/agents",
  mounts: [
    {
      type: "broker_mount",
      axon_id: axon.id,
      protocol: "acp",
      agent_binary: AGENT_BINARY,
      launch_args: ["acp"],
    },
  ],
});
const agent = new ACPAxonConnection(axon, devbox, {
  onDisconnect: async () => {
    await devbox.shutdown();
  },
});
console.log(`Devbox ready: ${agent.devboxId}`);

process.on("SIGINT", async () => {
  console.log(`\nInterrupted — destroying devbox ${agent.devboxId}...`);
  await agent.disconnect();
  process.exit(0);
});

// ---------------------------------------------------------------------------
// Initialize + create session
// ---------------------------------------------------------------------------

console.log("Initializing ACP connection...");

let initResp;
try {
  initResp = await agent.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: { name: "acp-cli", version: "0.1.0" },
    clientCapabilities: {},
  });
} catch (err) {
  console.error("Failed to initialize agent:", err);
  await agent.disconnect();
  process.exit(1);
}

if (VERBOSE) {
  const agentInfo = initResp.agentInfo;
  console.log(
    `  Agent: ${agentInfo?.name ?? "unknown"} ${agentInfo?.version ?? ""}, protocol ${initResp.protocolVersion}`,
  );
}

let session;
try {
  session = await agent.newSession({ cwd: "/home/user", mcpServers: [] });
} catch (err) {
  console.error("Failed to create session:", err);
  await agent.disconnect();
  process.exit(1);
}
const sessionId = session.sessionId;
console.log(`Session ready: ${sessionId}\n`);

// ---------------------------------------------------------------------------
// Stream session updates
// ---------------------------------------------------------------------------

agent.onSessionUpdate((_sid, update) => {
  if (isAgentMessageChunk(update)) {
    if (update.content.type === "text") {
      process.stdout.write(update.content.text);
    }
  } else if (isAgentThoughtChunk(update)) {
    if (VERBOSE && update.content.type === "text") {
      const thought = update.content.text;
      console.log(
        `\n[thinking] ${thought.slice(0, 200)}${thought.length > 200 ? "..." : ""}`,
      );
    }
  } else if (isToolCall(update)) {
    console.log(`\n[tool] ${update.title}`);
  } else if (isToolCallProgress(update)) {
    if (VERBOSE) {
      console.log(
        `  [${update.status ?? "running"}] ${update.title ?? update.toolCallId}`,
      );
    }
  } else if (isPlan(update)) {
    if (VERBOSE) {
      const tasks = update.entries
        .map((e) => `  - [${e.status}] ${e.content}`)
        .join("\n");
      console.log(`\n[plan]\n${tasks}`);
    }
  } else if (isUsageUpdate(update)) {
    if (VERBOSE) {
      const cost =
        update.cost?.amount != null ? ` $${update.cost.amount.toFixed(4)}` : "";
      console.log(`\n[usage] ${update.used}/${update.size} tokens${cost}`);
    }
  }
});

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

const rl: Interface = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(): Promise<string> {
  return new Promise<string>((resolve) => rl.question("\n> ", resolve));
}

console.log("ACP CLI (type 'exit' to quit, 'cancel' to stop current turn)\n");

while (true) {
  const input = await question();
  const trimmed = input.trim();
  if (!trimmed) continue;
  if (trimmed.toLowerCase() === "exit") break;
  if (trimmed.toLowerCase() === "cancel") {
    await agent
      .cancel({ sessionId })
      .catch((err: unknown) => console.error(`Cancel failed: ${err}`));
    continue;
  }

  try {
    await agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: trimmed }],
    });
    console.log(); // newline after streamed text
  } catch (err: unknown) {
    console.error(`Error: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

rl.close();
console.log("\nDisconnecting...");
await agent.disconnect();
console.log("Done.");
process.exit(0);
