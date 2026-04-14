# @runloop/agent-axon-client

[![CI](https://github.com/runloopai/agent-axon-client-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/runloopai/agent-axon-client-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@runloop/agent-axon-client)](https://www.npmjs.com/package/@runloop/agent-axon-client)
[![codecov](https://codecov.io/gh/runloopai/agent-axon-client-ts/branch/main/graph/badge.svg)](https://codecov.io/gh/runloopai/agent-axon-client-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Alpha — subject to change.** This SDK is in early development. APIs, interfaces, and behavior may change without notice between versions.

TypeScript SDK for connecting to coding agents (Claude Code, OpenCode, etc.) running inside [Runloop](https://runloop.ai) devboxes via the Axon event bus.

## Key Concepts

Before getting started, it's helpful to understand these core concepts:

- **Runloop** — A cloud platform that provides on-demand development environments (devboxes) where coding agents can run.
- **Devbox** — An isolated Linux container/environment running in Runloop's cloud where coding agents execute. It has a filesystem, can run commands, and persists for the duration of your session.
- **Axon** — A bidirectional message bus that enables real-time communication between your application and an agent running in a Runloop devbox. Think of it as a WebSocket-like channel for agent control.
- **Broker Mount** — A devbox configuration that connects an Axon channel to an agent binary, specifying which agent to run (opencode, claude, etc.), the protocol to use (acp, claude_json), and launch arguments.

In short: **Runloop** hosts **devboxes** where agents run; a **broker mount** connects that agent to **Axon**; and **Axon** is the message bus your app uses to control it.

## Prerequisites

- [Node.js](https://nodejs.org) >= 22.0.0
- A [Runloop](https://runloop.ai) API key
  - Sign up for free at [platform.runloop.ai](https://platform.runloop.ai) (includes $50 in credits)
  - Navigate to [Settings](https://platform.runloop.ai/settings) → API Keys
  - Create an API key (starts with `ak`_)
  - Set environment variable: `export RUNLOOP_API_KEY=ak_your_key`
- An [Anthropic](https://console.anthropic.com) API key (**only required for Claude module examples**)
  - Sign up at [console.anthropic.com](https://console.anthropic.com)
  - Go to API Keys section
  - Create new key (starts with `sk-ant-`)
  - Set environment variable: `export ANTHROPIC_API_KEY=sk-ant-your_key`

## Installation

```bash
npm install @runloop/agent-axon-client @runloop/api-client
```

`@runloop/api-client` is a required peer dependency — it provides the `RunloopSDK` instance and Axon types used by both modules.

If you're using the Claude module, also install:

```bash
npm install @anthropic-ai/claude-agent-sdk
```

## Status & Roadmap

### Supported Features by Protocol


| Capability                                   | Claude | ACP |
| -------------------------------------------- | ------ | --- |
| Send prompts / messages                      | ✅      | ✅   |
| Streaming responses                          | ✅      | ✅   |
| Tool use / tool results                      | ✅      | ✅   |
| Cancel / interrupt turns                     | ✅      | ✅   |
| Permission / control requests (auto-approve) | ✅      | ✅   |


*Auto-approve only for now, permission request flow pending

### Coming Soon


| Status     | Description                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 🚧 Planned | **Agent installation** — support for automatically getting agents installed on the devbox                                                  |
| 🚧 Planned | **Devbox state-transition events** — expose devbox lifecycle state changes (creating → running → suspended → …) as first-class Axon events |
| 🚧 Planned | **Axon subscribe over WebSockets** — WebSocket transport for Axon subscriptions, enabling browser clients without a backend proxy          |


### Known Issues


| Status | Description                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 🐛 Bug | Suspend and resume of a devbox will not work correctly at the moment, this will be fixed soon.                                       |


## Modules

The SDK has two independent modules — pick the one that matches your agent's protocol:


| Module     | Import path                         | Protocol                                                                | Use when                                        |
| ---------- | ----------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| **ACP**    | `@runloop/agent-axon-client/acp`    | [Agent Client Protocol](https://agentclientprotocol.com) (JSON-RPC 2.0) | Using OpenCode, or Claude via ACP               |
| **Claude** | `@runloop/agent-axon-client/claude` | Claude Code SDK wire format                                             | Using Claude Code with native SDK message types |


### Which module should I use?

**Use the ACP module when:**

- You want agent-agnostic code that works with multiple agents (OpenCode, Claude via ACP, future agents)
- You need a standardized JSON-RPC 2.0 protocol
- You want maximum compatibility and flexibility

**Use the Claude module when:**

- You're specifically using Claude Code
- You want native Claude SDK message types
- You need Claude-specific features

**Note:** The modules have different APIs and are not directly interchangeable. Choose based on your agent and requirements.

## Usage

### ACP module

```typescript
import { ACPAxonConnection, PROTOCOL_VERSION, isAgentMessageChunk } from "@runloop/agent-axon-client/acp";
import { RunloopSDK } from "@runloop/api-client";

const sdk = new RunloopSDK({ bearerToken: process.env.RUNLOOP_API_KEY });

const axon = await sdk.axon.create({ name: "acp-transport" });
const devbox = await sdk.devbox.create({
  mounts: [
    {
      type: "broker_mount",
      axon_id: axon.id,
      protocol: "acp",
      agent_binary: "opencode",
      launch_args: ["acp"],
    },
  ],
});
const agent = new ACPAxonConnection(axon, devbox, {
  onDisconnect: async () => {
    await devbox.shutdown();
  },
});

await agent.connect();
await agent.initialize({
  protocolVersion: PROTOCOL_VERSION,
  clientInfo: { name: "my-app", version: "1.0.0" },
});

agent.onSessionUpdate((sessionId, update) => {
  if (isAgentMessageChunk(update)) process.stdout.write(update.message);
});

const session = await agent.newSession({ cwd: "/home/user", mcpServers: [] });
await agent.prompt({
  sessionId: session.sessionId,
  prompt: [{ type: "text", text: "Hello!" }],
});

await agent.disconnect();
```

### Claude module

```typescript
import { ClaudeAxonConnection } from "@runloop/agent-axon-client/claude";
import { RunloopSDK } from "@runloop/api-client";

const sdk = new RunloopSDK({ bearerToken: process.env.RUNLOOP_API_KEY });

const axon = await sdk.axon.create({ name: "claude-transport" });
const devbox = await sdk.devbox.create({
  mounts: [{
    type: "broker_mount",
    axon_id: axon.id,
    protocol: "claude_json",
    agent_binary: "claude",
  }],
});

const conn = new ClaudeAxonConnection(axon, devbox, { model: "claude-sonnet-4-5" });
await conn.connect();
await conn.initialize();

await conn.send("What files are in this directory?");

for await (const msg of conn.receiveResponse()) {
  console.log(msg.type, msg);
}

await conn.disconnect();
```

### Timeline events

Both modules provide a unified timeline event stream — the recommended way to build chat UIs that need a single chronological view of protocol messages, system events (turn start/end), and custom events.

Every timeline event has `{ kind, data, axonEvent }` where `kind` is a discriminant (`"acp_protocol"` / `"claude_protocol"`, `"system"`, or `"unknown"`), `data` is the typed payload, and `axonEvent` is the raw Axon event with full metadata.

**ACP — handling protocol events:**

```typescript
import { SYSTEM_EVENT_TYPES } from "@runloop/agent-axon-client/shared";
import {
  isAgentMessageChunk,
  isToolCall,
  isToolCallProgress,
} from "@runloop/agent-axon-client/acp";

agent.onTimelineEvent((event) => {
  switch (event.kind) {
    case "acp_protocol":
      if (event.eventType === "session/update") {
        const update = event.data.update;
        if (isAgentMessageChunk(update)) {
          process.stdout.write(update.text);
        } else if (isToolCall(update)) {
          console.log(`Tool: ${update.name} (${update.status})`);
        } else if (isToolCallProgress(update)) {
          console.log(`Tool output: ${update.content}`);
        }
      }
      break;
    case "unknown":
      console.log(
        `Unrecognized event: ${event.axonEvent.event_type}`,
        event.axonEvent.payload,
      );
      break;
  }
});
```

**Claude:**

```typescript
conn.onTimelineEvent((event) => {
  switch (event.kind) {
    case "claude_protocol":
      if (event.eventType === "assistant") {
        process.stdout.write(event.data.content);
      } else if (event.eventType === "result") {
        console.log("Result:", event.data.content);
      }
      break;
    case "unknown":
      break;
  }
});
```

**Custom events** — use `publish()` to push your own events to the channel. They arrive as `kind: "unknown"` timeline events:

```typescript
import { tryParseTimelinePayload } from "@runloop/agent-axon-client/acp";

// Publish a custom event
await conn.publish({
  event_type: "build_status",
  origin: "EXTERNAL_EVENT",
  source: "ci-pipeline",
  payload: JSON.stringify({ step: "compile", progress: 75 }),
});

// Consume it on the other side
conn.onTimelineEvent((event) => {
  if (event.kind === "unknown" && event.axonEvent.event_type === "build_status") {
    const status = tryParseTimelinePayload<{ step: string; progress: number }>(event);
    if (status) console.log(`${status.step}: ${status.progress}%`);
  }
});
```

Both modules also support pull-based consumption via an async generator:

```typescript
for await (const event of agent.receiveTimelineEvents()) {
  console.log(event.kind, event.data);
}
```

See the [SDK documentation](sdk/README.md#custom-events-via-publish-and-tryparsetimelinepayload) for more on custom events, and the [full timeline API reference](sdk/README.md#timeline-events) for replay behavior and `afterSequence`.

See the [SDK documentation](sdk/README.md) for the full API reference.

## Repository Structure

```
sdk/                      → @runloop/agent-axon-client (the published npm package)
examples/
  acp-hello-world/        → Minimal ACP single-prompt script
  acp-cli/                → Interactive ACP REPL
  acp-app/                → Full-stack ACP demo (Express + React)
  claude-hello-world/     → Minimal Claude single-prompt script
  claude-cli/             → Interactive Claude REPL
  claude-app/             → Full-stack Claude demo (Express + React)
  combined-app/           → Full-stack combined demo (Claude + ACP, Express + React)
```

## Development

**Prerequisites:**

- [Node.js](https://nodejs.org) >= 22.0.0
- [Bun](https://bun.sh) (package manager and task runner)

```bash
bun install
bun run build
bun run test
bun run check    # lint + format verification
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, commit conventions, and PR guidelines.

## License

[MIT](LICENSE)