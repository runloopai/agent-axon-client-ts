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
  isAgentTextChunk,
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

// Map CLI agent names to public agent mount names
const AGENT_MOUNT_MAP: Record<string, string> = {
  opencode: "opencode",
  "codex-acp": "codex-acp",
};

const agentMountName = AGENT_MOUNT_MAP[AGENT_BINARY] ?? AGENT_BINARY;

console.log(`Starting devbox with agent "${AGENT_BINARY}"...`);
// The agent_mount installs the agent binary; the broker_mount wires the
// Axon channel to the agent via the ACP protocol.
const axon = await sdk.axon.create({ name: "acp-transport" });
const devbox = await sdk.devbox.create({
  name: "acp-hello-world",
  mounts: [
    {
      type: "agent_mount",
      agent_name: agentMountName,
    },
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

await agent.connect();
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
  if (isAgentTextChunk(update)) {
    process.stdout.write(update.content.text);
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
// Wait a couple seconds for the status updates to come back, turn complete according to the sdk is when the agent is done, the updates follow after
await new Promise((resolve) => setTimeout(resolve, 2000));

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

console.log("Disconnecting...");
await agent.disconnect();
console.log("Done.");
process.exit(0);
