/**
 * Interactive CLI using the SDK2 ClaudeSDKConnection.
 *
 * Creates a Runloop Devbox + Axon session, connects the ClaudeSDKConnection,
 * and runs a REPL that streams assistant messages in real time.
 *
 * Usage:
 *   bun run claude-cli.ts
 *   bun run claude-cli.ts --model haiku-4.5
 *   VERBOSE=1 bun run claude-cli.ts
 */

import { RunloopSDK } from "@runloop/api-client";
import { createInterface, type Interface } from "readline";
import { ClaudeSDKConnection } from "@runloop/agent-axon-client/claude";
import type {
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

import { parseArgs } from "util";

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    model: { type: "string" },
    "system-prompt": { type: "string" },
    verbose: { type: "boolean", default: false },
  },
});

const VERBOSE = args.verbose || !!process.env.VERBOSE;
const MODEL = args.model ?? null;
const SYSTEM_PROMPT = args["system-prompt"] ?? null;
const BLUEPRINT_ID = "bpt_32sRBMzW5R817DLugj9v7";

// ---------------------------------------------------------------------------
// Session setup
// ---------------------------------------------------------------------------

const runloop = new RunloopSDK();

console.log("Starting devbox...");
const axon = await runloop.axon.create({ name: "cli-sdk-session" });
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
// Connect the client
// ---------------------------------------------------------------------------

const client = new ClaudeSDKConnection(axon, devbox, {
  verbose: VERBOSE,
  ...(MODEL && { model: MODEL }),
  ...(SYSTEM_PROMPT && { systemPrompt: SYSTEM_PROMPT }),
});

console.log("Connecting to Claude...");
await client.connect();
if (MODEL) {
  console.log(`Model set to: ${MODEL}`);
}
console.log("Connected.\n");

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

function renderMessage(msg: SDKMessage): void {
  switch (msg.type) {
    case "assistant": {
      for (const block of msg.message.content) {
        switch (block.type) {
          case "text":
            process.stdout.write(block.text);
            break;
          case "thinking":
            if (VERBOSE) {
              console.log(`\n[thinking] ${block.thinking.slice(0, 200)}...`);
            }
            break;
          case "tool_use":
            console.log(`\n> ${block.name}(${JSON.stringify(block.input).slice(0, 120)})`);
            break;
        }
      }
      break;
    }

    case "system": {
      switch (msg.subtype) {
        case "task_started":
          console.log(`\nTask started: ${msg.description}`);
          break;
        case "task_progress":
          if (VERBOSE) {
            console.log(`  Progress: ${msg.description} (${msg.usage.tool_uses} tool uses)`);
          }
          break;
        case "task_notification":
          console.log(`  Task ${msg.status}: ${msg.summary}`);
          break;
        case "init":
          if (VERBOSE) {
            console.log(`  [init] model=${msg.model} tools=${msg.tools?.length ?? "?"}`);
          }
          break;
        default:
          if (VERBOSE) {
            console.log(`  [system:${msg.subtype}]`);
          }
          break;
      }
      break;
    }

    case "result": {
      console.log(); // newline after streamed text
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

    case "rate_limit_event":
      console.log(`Rate limit: ${msg.rate_limit_info.status}`);
      break;
  }
}

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });

function prompt(): Promise<string> {
  return new Promise<string>((resolve) => rl.question("\n> ", resolve));
}

console.log("Claude CLI (type 'exit' to quit\n");

while (true) {
  const input = await prompt();
  const trimmed = input.trim();
  if (!trimmed) continue;
  if (trimmed.toLowerCase() === "exit") break;

  try {
    await client.send(trimmed);

    for await (const msg of client.receiveResponse()) {
      renderMessage(msg);
    }
  } catch (err: unknown) {
    console.error(`Error: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

rl.close();
console.log("\nDisconnecting...");
await client.disconnect();
console.log("Done.");
process.exit(0);
