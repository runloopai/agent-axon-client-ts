# @runloop/agent-axon-client

> **Alpha — subject to change.** This SDK is in early development. APIs, interfaces, and behavior may change without notice between versions.

TypeScript client for connecting to coding agents running inside [Runloop](https://runloop.ai) devboxes via the Axon event bus.

This package provides two independent modules:

| Module | Import path | Protocol | Use case |
|--------|-------------|----------|----------|
| **ACP** | `@runloop/agent-axon-client/acp` | [Agent Client Protocol](https://agentclientprotocol.com) (JSON-RPC 2.0) | Any ACP-compatible agent (OpenCode, Claude via ACP, etc.) |
| **Claude** | `@runloop/agent-axon-client/claude` | Claude Code SDK wire format | Claude Code with native SDK message types |

Both modules communicate over Runloop Axon channels. Pick the one that matches your agent's protocol.

## Installation

```bash
npm install @runloop/agent-axon-client @runloop/api-client
```

`@runloop/api-client` is a peer dependency — you provide the Runloop SDK instance.

If using the Claude module, you also need:

```bash
npm install @anthropic-ai/claude-agent-sdk
```

## Imports

```typescript
// Subpath imports (recommended — tree-shakable)
import { ACPAxonConnection, PROTOCOL_VERSION } from "@runloop/agent-axon-client/acp";
import { ClaudeAxonConnection } from "@runloop/agent-axon-client/claude";

// Namespaced root import (both modules at once)
import { acp, claude } from "@runloop/agent-axon-client";
```

## Getting Started

### ACP Agent

```typescript
import {
  ACPAxonConnection,
  isAgentMessageChunk,
  PROTOCOL_VERSION,
} from "@runloop/agent-axon-client/acp";
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
const agent = new ACPAxonConnection(axon, devbox);

await agent.initialize({
  protocolVersion: PROTOCOL_VERSION,
  clientInfo: { name: "my-app", version: "1.0.0" },
});

// Session updates (message chunks, tool calls, etc.) arrive asynchronously
// after prompt() resolves. This is an ACP protocol limitation
agent.onSessionUpdate((sessionId, update) => {
  if (isAgentMessageChunk(update)) {
    process.stdout.write(update.message);
  }
});

const session = await agent.newSession({ cwd: "/home/user", mcpServers: [] });
await agent.prompt({
  sessionId: session.sessionId,
  prompt: [{ type: "text", text: "Hello!" }],
});
```

### Claude Code Agent

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

---

## ACP Module

### `ACPAxonConnection`

Higher-level wrapper that manages an `axonStream`, an `AbortController`, and the ACP `ClientSideConnection`.

**Constructor**: `new ACPAxonConnection(axon, devbox, options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `axon` | `Axon` | Axon channel from `@runloop/api-client` |
| `devbox` | `Devbox` | Runloop devbox from `@runloop/api-client` |

**Options** (`ACPAxonConnectionOptions`):

| Field | Type | Description |
|-------|------|-------------|
| `requestPermission` | `(params) => Promise<Response>` | Custom permission handler (defaults to auto-approve) |
| `onError` | `(error: unknown) => void` | Error callback |
| `onStreamInterrupted` | `() => void` | Called when the SSE stream is interrupted |
| `onDisconnect` | `() => void \| Promise<void>` | Teardown callback invoked by `shutdown()` (e.g. devbox shutdown) |

**ACP Methods** (proxied from `ClientSideConnection`):

| Method | Description |
|--------|-------------|
| `initialize(params)` | Establishes the connection and negotiates capabilities |
| `newSession(params)` | Creates a new conversation session |
| `loadSession(params)` | Loads an existing session |
| `listSessions(params)` | Lists existing sessions |
| `prompt(params)` | Sends a prompt and processes the agent's turn |
| `cancel(params)` | Cancels an ongoing prompt turn |
| `authenticate(params)` | Authenticates using an advertised method |
| `setSessionMode(params)` | Sets session mode (e.g. "ask", "code") |
| `setSessionConfigOption(params)` | Sets a session config option |
| `extMethod(method, params)` | Extension request |
| `extNotification(method, params)` | Extension notification |

**Listeners & Lifecycle**:

| Property / Method | Description |
|---|---|
| `protocol: ClientSideConnection` | Escape hatch for experimental/unstable ACP methods |
| `axonId: string` | The Axon channel ID |
| `devboxId: string` | The Runloop devbox ID |
| `signal: AbortSignal` | Fires when the connection closes |
| `closed: Promise<void>` | Resolves when the connection closes |
| `onSessionUpdate(listener)` | Register a session update listener. Returns unsubscribe function. |
| `onAxonEvent(listener)` | Register an Axon event listener. Returns unsubscribe function. |
| `abortStream()` | Abort the SSE stream without clearing listeners (useful for testing / reconnect) |
| `disconnect()` | Abort the stream, clear all listeners, and run the `onDisconnect` callback |

### Provisioning Axon + devbox

Create an Axon channel, attach a devbox `broker_mount` with `protocol: "acp"`, then pass `axon` and `devboxId` into `ACPAxonConnection`:

```typescript
import { ACPAxonConnection, PROTOCOL_VERSION } from "@runloop/agent-axon-client/acp";
import { RunloopSDK } from "@runloop/api-client";

const sdk = new RunloopSDK({ bearerToken: process.env.RUNLOOP_API_KEY });
const axon = await sdk.axon.create({ name: "my-channel" });
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

const conn = new ACPAxonConnection(axon, devbox.id, {
  onDisconnect: async () => {
    await devbox.shutdown();
  },
  requestPermission: async (params) => {
    const option = params.options[0];
    return { outcome: { outcome: "selected", optionId: option.optionId } };
  },
  onError: (err) => console.warn("transport error:", err),
});

conn.onSessionUpdate((sessionId, update) => {
  console.log(sessionId, update);
});

await conn.initialize({
  protocolVersion: PROTOCOL_VERSION,
  clientInfo: { name: "my-app", version: "1.0.0" },
});
```

### `axonStream(options): Stream`

Low-level function that creates an ACP-compatible duplex stream backed by an `Axon` channel from `@runloop/api-client`. Uses `axon.subscribeSse()` for inbound events and `axon.publish()` for outbound messages.

**Parameters** (`AxonStreamOptions`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `axon` | `Axon` | Yes | Axon channel from `@runloop/api-client` |
| `signal` | `AbortSignal` | No | Cancellation signal |
| `onAxonEvent` | `(event: AxonEventView) => void` | No | Callback for every Axon event |
| `onError` | `(error: unknown) => void` | No | Callback for swallowed parse errors |
| `onStreamInterrupted` | `() => void` | No | Called when the SSE stream is interrupted |

**Returns**: `{ readable: ReadableStream<AnyMessage>; writable: WritableStream<AnyMessage> }`

The stream handles JSON-RPC ID correlation internally — Axon's wire format doesn't carry IDs, so the transport layer maintains mapping tables to synthesize and restore them.

### Session Update Type Guards

Narrowing helpers for discriminating `SessionUpdate` variants:

```typescript
import {
  isUserMessageChunk,
  isAgentMessageChunk,
  isToolCall,
  isUsageUpdate,
  // ...
} from "@runloop/agent-axon-client/acp";

agent.onSessionUpdate((sessionId, update) => {
  if (isAgentMessageChunk(update)) {
    process.stdout.write(update.message);
  } else if (isToolCall(update)) {
    console.log(`Tool: ${update.toolName}`);
  }
});
```

Available guards: `isUserMessageChunk`, `isAgentMessageChunk`, `isAgentThoughtChunk`, `isToolCall`, `isToolCallProgress`, `isPlan`, `isAvailableCommandsUpdate`, `isCurrentModeUpdate`, `isConfigOptionUpdate`, `isSessionInfoUpdate`, `isUsageUpdate`.

### Re-exported ACP Types

All types from `@agentclientprotocol/sdk` are re-exported for convenience:

```typescript
import type {
  SessionUpdate,
  SessionNotification,
  ToolCall,
  ContentBlock,
  // ... etc.
} from "@runloop/agent-axon-client/acp";
```

---

## Claude Module

### `ClaudeAxonConnection`

Bidirectional, interactive client for Claude Code via Axon. Messages are yielded as `SDKMessage` from `@anthropic-ai/claude-agent-sdk` — the exact types the Claude Code CLI emits.

**Constructor**: `new ClaudeAxonConnection(axon, devbox, options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `axon` | `Axon` | Axon channel from `@runloop/api-client` |
| `devbox` | `Devbox` | Runloop devbox from `@runloop/api-client` |

**Options** (`ClaudeAxonConnectionOptions`):

| Field | Type | Description |
|-------|------|-------------|
| `verbose` | `boolean` | Emit verbose logs to stderr |
| `systemPrompt` | `string` | Override the system prompt |
| `appendSystemPrompt` | `string` | Append to the default system prompt |
| `model` | `string` | Model ID (e.g. `"claude-sonnet-4-5"`) — set after initialization |
| `onDisconnect` | `() => void \| Promise<void>` | Teardown callback invoked by `disconnect()` (e.g. devbox shutdown) |

**Lifecycle**:

| Method | Description |
|--------|-------------|
| `connect()` | Connect to Claude Code, initialize the control protocol, and set model if configured |
| `disconnect()` | Close the transport, fail pending requests, and run `onDisconnect` if provided |

**Messaging**:

| Method | Description |
|--------|-------------|
| `send(prompt)` | Send a user message. Accepts a `string` or `SDKUserMessage`. |
| `receiveMessages()` | Async iterator yielding all `SDKMessage`s indefinitely |
| `receiveResponse()` | Async iterator yielding messages until (and including) a `result` message |

**Control**:

| Method | Description |
|--------|-------------|
| `interrupt()` | Interrupt the current conversation turn |
| `setPermissionMode(mode)` | Change the permission mode |
| `setModel(model)` | Change the AI model |

**Listeners**:

| Method | Description |
|--------|-------------|
| `onAxonEvent(listener)` | Register an Axon event listener. Returns unsubscribe function. |

### `AxonTransport`

Lower-level transport that implements the `Transport` interface using Runloop Axon. Used internally by `ClaudeAxonConnection` but available for custom integrations.

```typescript
import { AxonTransport, type Transport } from "@runloop/agent-axon-client/claude";

const transport = new AxonTransport(axon, { verbose: true });
await transport.connect();

await transport.write(JSON.stringify({ type: "user", message: { role: "user", content: "Hello" } }));

for await (const msg of transport.readMessages()) {
  console.log(msg);
}

await transport.close();
```

**`Transport` interface**:

| Method | Description |
|--------|-------------|
| `connect()` | Open the underlying connection |
| `write(data: string)` | Send a JSON message string |
| `readMessages()` | Async iterable of parsed inbound messages |
| `close()` | Close the transport |
| `isReady()` | Whether the transport is connected and not closed |

---

## Architecture

Both modules communicate over Runloop Axon channels but use different wire formats:

```
ACP Module                                    Claude Module

┌─────────────────┐                           ┌─────────────────┐
│  axonStream()   │                           │  AxonTransport   │
│  (Axon SDK)     │                           │  (Axon SDK)      │
│       ↕         │                           │       ↕          │
│  JSON-RPC 2.0   │         Axon Bus          │  Claude SDK      │
│  translation    │◄───────────────────────►  │  wire format     │
│       ↕         │       (SSE + publish)     │       ↕          │
│  ACPAxon        │                           │  ClaudeAxon      │
│  Connection     │                           │  Connection      │
└─────────────────┘                           └─────────────────┘
        ↕                                             ↕
   ACP Agent                                   Claude Code
   (in devbox)                                 (in devbox)
```

| | ACP Module | Claude Module |
|---|---|---|
| Wire format | JSON-RPC 2.0 via Axon events | Claude SDK messages via Axon events |
| Transport | `@runloop/api-client` Axon SDK | `@runloop/api-client` Axon SDK |
| Agent protocol | `@agentclientprotocol/sdk` | `@anthropic-ai/claude-agent-sdk` |
| ID tracking | Synthetic (transport maps IDs) | Native (SDK handles correlation) |

## Types

### `AxonEventView` (ACP module)

Raw event from the Axon event bus:

```typescript
interface AxonEventView {
  axon_id: string;
  event_type: string;
  origin: "EXTERNAL_EVENT" | "AGENT_EVENT" | "USER_EVENT" | "SYSTEM_EVENT";
  payload: string;
  sequence: number;
  source: string;
  timestamp_ms: number;
}
```

### `WireData` (Claude module)

Generic JSON wire format used by the Claude transport:

```typescript
type WireData = Record<string, any>;
```

## Known Limitations

- **Eager SSE connection** (ACP): The `ACPAxonConnection` constructor immediately opens an SSE subscription via `axon.subscribeSse()`. Connection errors surface on the first awaited method call, not at construction time.
- **No automatic reconnection**: If an SSE stream drops, the connection is dead. Create a new instance to reconnect.
- **Permission handling** (Claude): The `ClaudeAxonConnection` auto-approves all tool use by default. Override via incoming control request handling is not yet exposed as a configuration option.

### ACP: `prompt()` resolves before all session updates arrive

The Axon broker delivers events in this order for a given turn:

1. `session/prompt` response — resolves the `prompt()` promise (`stopReason: "end_turn"`)
2. `turn.completed` system event
3. `session/update` notifications — thought chunks, message chunks, etc.

This means **`await agent.prompt(...)` returns before the agent's response text has been delivered via `onSessionUpdate`**. If you need to know when all content for a turn has arrived, use one of these strategies:

- **Use `onAxonEvent` to watch for `turn.started` / `turn.completed` system events** (recommended). These bracket all content for a turn:

  ```typescript
  agent.onAxonEvent((event) => {
    if (event.origin !== "SYSTEM_EVENT") return;
    if (event.event_type === "turn.started") {
      // Agent turn began — disable input, show cancel button
    }
    if (event.event_type === "turn.completed") {
      // All content for this turn has been delivered
    }
  });
  ```

- **Debounce after `prompt()` resolves** — wait a short period (e.g. 200ms) for trailing `session/update` events. This is a heuristic and may drop events on slow connections.

## License

[MIT](../LICENSE)
