# @runloop/agent-axon-client

> **Alpha — subject to change.** This SDK is in early development. APIs, interfaces, and behavior may change without notice between versions.

TypeScript SDK for connecting to coding agents (Claude Code, OpenCode, etc.) running inside [Runloop](https://runloop.ai) devboxes via the Axon event bus.

## Key Concepts

Before getting started, it's helpful to understand these core concepts:

- **Runloop** — A cloud platform that provides on-demand development environments (devboxes) where coding agents can run.
- **Devbox** — An isolated Linux container/environment running in Runloop's cloud where coding agents execute. It has a filesystem, can run commands, and persists for the duration of your session.
- **Axon** — A bidirectional message bus that enables real-time communication between your application and an agent running in a Runloop devbox. Think of it as a WebSocket-like channel for agent control.
- **Broker Mount** — A devbox configuration that connects an Axon channel to an agent binary, specifying which agent to run (opencode, claude, etc.), the protocol to use (acp, claude_json), and launch arguments.

In short: the **devbox** is where the agent runs (compute environment), and the **Axon** is how you communicate with it (message bus).

## Prerequisites

- [Node.js](https://nodejs.org) >= 22.0.0
- A [Runloop](https://runloop.ai) API key
  - Sign up for free at [platform.runloop.ai](https://platform.runloop.ai) (includes $50 in credits)
  - Navigate to [Settings](https://platform.runloop.ai/settings) → API Keys
  - Create an API key (starts with `ak_`)
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

## Modules

The SDK has two independent modules — pick the one that matches your agent's protocol:

| Module | Import path | Protocol | Use when |
|--------|-------------|----------|----------|
| **ACP** | `@runloop/agent-axon-client/acp` | [Agent Client Protocol](https://agentclientprotocol.com) (JSON-RPC 2.0) | Using OpenCode, or Claude via ACP |
| **Claude** | `@runloop/agent-axon-client/claude` | Claude Code SDK wire format | Using Claude Code with native SDK message types |

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
const agent = new ACPAxonConnection({
  axon,
  devboxId: devbox.id,
  shutdown: async () => {
    await devbox.shutdown();
  },
});

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

await agent.shutdown();
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

await conn.send("What files are in this directory?");

for await (const msg of conn.receiveResponse()) {
  console.log(msg.type, msg);
}

await conn.disconnect();
```

See the [SDK documentation](sdk/README.md) for the full API reference.

## Repository Structure

```
sdk/          → @runloop/agent-axon-client (the published npm package)
examples/
  acp-app/    → Full-stack ACP demo (Express + React)
  claude-app/ → Full-stack Claude demo (Express + React)
  claude-cli/ → Minimal Claude CLI demo
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
