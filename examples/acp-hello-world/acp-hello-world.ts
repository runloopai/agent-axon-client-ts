/**
 * Minimal ACP hello-world example.
 *
 * Creates a Runloop Devbox, connects via the ACP protocol,
 * sends a single prompt, prints the response, and exits.
 *
 * Usage:
 *   bun run acp-hello-world.ts
 *   bun run acp-hello-world.ts --agent opencode
 */

import { RunloopSDK } from "@runloop/api-client";
import {
  ACPAxonConnection,
  PROTOCOL_VERSION,
  isAgentMessageChunk,
  isToolCall,
} from "@runloop/agent-axon-client/acp";
import { parseArgs } from "util";

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    agent: { type: "string", default: "opencode" },
  },
});

const AGENT_BINARY = args.agent ?? "opencode";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const sdk = new RunloopSDK();

console.log(`Starting devbox with agent "${AGENT_BINARY}"...`);
// The runloop/agents blueprint used has opencode pre-installed.
// When using ACPAxonConnection, ensure the agent binary is on the blueprint
// (Agent API or custom blueprint).
const axon = await sdk.axon.create({ name: "acp-transport" });
const devbox = await sdk.devbox.create({
  name: "acp-hello-world",
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

// ---------------------------------------------------------------------------
// Initialize + create session
// ---------------------------------------------------------------------------

// Log SYSTEM_EVENTs for debugging (e.g. turn.started, turn.completed).
// Broker errors like "agent binary not found" will also reject initialize() below.
agent.onAxonEvent((ev) => {
  if (ev.origin === "SYSTEM_EVENT") {
    console.error(`[system] ${ev.event_type}: ${ev.payload}`);
  }
});

try {
  await agent.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: { name: "acp-hello-world", version: "0.1.0" },
  });
} catch (err) {
  console.error("Failed to initialize agent:", err);
  await agent.disconnect();
  process.exit(1);
}

let session;
try {
  session = await agent.newSession({ cwd: "/home/user", mcpServers: [] });
} catch (err) {
  console.error("Failed to create session:", err);
  await agent.disconnect();
  process.exit(1);
}
console.log(`Session ready: ${session.sessionId}\n`);

// ---------------------------------------------------------------------------
// Stream session updates
// ---------------------------------------------------------------------------

agent.onSessionUpdate((_sid, update) => {
  if (isAgentMessageChunk(update)) {
    if (update.content.type === "text") {
      process.stdout.write(update.content.text);
    }
  } else if (isToolCall(update)) {
    const input = JSON.stringify(update.rawInput ?? {}).slice(0, 120);
    console.log(`\n> ${update.title}(${input})`);
  }
});

// ---------------------------------------------------------------------------
// Send a single prompt
// ---------------------------------------------------------------------------

console.log("Sending prompt: 'Say hello world'\n");
await agent.prompt({
  sessionId: session.sessionId,
  prompt: [{ type: "text", text: "Say hello world" }],
});
console.log("\n");

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

console.log("Disconnecting...");
await agent.disconnect();
console.log("Done.");
process.exit(0);
