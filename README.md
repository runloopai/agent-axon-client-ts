# @runloop/agent-axon-client

> **Alpha — subject to change.** This SDK is in early development. APIs, interfaces, and behavior may change without notice between versions.

TypeScript SDK for connecting to coding agents (Claude Code, OpenCode, etc.) running inside [Runloop](https://runloop.ai) devboxes via the Axon event bus.

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

## Usage

### ACP module

```typescript
import { createAxonAgent, PROTOCOL_VERSION, isAgentMessageChunk } from "@runloop/agent-axon-client/acp";
import { RunloopSDK } from "@runloop/api-client";

const sdk = new RunloopSDK({ bearerToken: process.env.RUNLOOP_API_KEY });

// Provision an Axon channel + devbox and connect
const agent = await createAxonAgent(sdk, {
  agentBinary: "opencode",
  launchArgs: ["acp"],
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
import { ClaudeSDKConnection } from "@runloop/agent-axon-client/claude";
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

const conn = new ClaudeSDKConnection(axon, devbox, { model: "claude-sonnet-4-5" });
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

Prerequisites: Node.js >= 22, [Bun](https://bun.sh)

```bash
bun install
bun run build
bun run test
bun run check    # lint + format verification
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, commit conventions, and PR guidelines.

## License

[MIT](LICENSE)
