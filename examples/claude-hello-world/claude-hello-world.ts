/**
 * Minimal Claude hello-world example.
 *
 * Creates a Runloop Devbox, connects via ClaudeSDKConnection,
 * sends a single prompt, prints the response, and exits.
 *
 * Usage:
 *   bun run claude-hello-world.ts
 *   bun run claude-hello-world.ts --model haiku-4.5
 */

import { RunloopSDK } from "@runloop/api-client";
import { ClaudeSDKConnection } from "@runloop/agent-axon-client/claude";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { parseArgs } from "util";

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    model: { type: "string" },
  },
});

const MODEL = args.model ?? null;
const BLUEPRINT_ID = "bpt_32sRBMzW5R817DLugj9v7";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const runloop = new RunloopSDK();

console.log("Starting devbox...");
const axon = await runloop.axon.create({ name: "hello-world-session" });
const devbox = await runloop.devbox.create({
  mounts: [
    {
      type: "broker_mount",
      axon_id: axon.id,
      protocol: "claude_json",
      launch_args: [],
    },
  ],
  blueprint_id: BLUEPRINT_ID,
  environment_variables: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  },
});
console.log(`Devbox ready: ${devbox.id}`);

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

const client = new ClaudeSDKConnection(axon, devbox, {
  ...(MODEL && { model: MODEL }),
});

console.log("Connecting to Claude...");
await client.connect();
console.log("Connected.\n");

// ---------------------------------------------------------------------------
// Send a single prompt and print the response
// ---------------------------------------------------------------------------

console.log("Sending prompt: 'Say hello world'\n");
await client.send("Say hello world");

for await (const msg of client.receiveResponse()) {
  renderMessage(msg);
}

function renderMessage(msg: SDKMessage): void {
  switch (msg.type) {
    case "assistant":
      for (const block of msg.message.content) {
        if (block.type === "text") {
          process.stdout.write(block.text);
        }
      }
      break;
    case "result":
      console.log();
      if (msg.is_error) {
        console.error(`Error: ${msg.subtype}`);
      } else {
        const cost = msg.total_cost_usd;
        const turns = msg.num_turns;
        const duration = (msg.duration_ms / 1000).toFixed(1);
        console.log(`--- ${turns} turn(s), ${duration}s, $${cost.toFixed(4)} ---`);
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

console.log("\nDisconnecting...");
await client.disconnect();
console.log("Done.");
process.exit(0);
