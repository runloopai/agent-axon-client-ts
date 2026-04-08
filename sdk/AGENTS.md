# AGENTS.md — @runloop/agent-axon-client

> AI-agent quick reference for using this SDK. For full docs see `README.md`.

## What this package does

Connects to coding agents (Claude Code, OpenCode, etc.) running inside Runloop
devboxes via the Axon event bus. Two protocol modules plus shared utilities.

## Choose your module

| Module | Import | When to use |
|--------|--------|-------------|
| **ACP** | `@runloop/agent-axon-client/acp` | Any ACP-compatible agent (OpenCode, Claude via ACP) |
| **Claude** | `@runloop/agent-axon-client/claude` | Claude Code with native SDK message types |
| **Shared** | `@runloop/agent-axon-client/shared` | Common types (`BaseConnectionOptions`, `AxonEventView`, `AxonEventListener`) and utilities |

## Required dependencies

```bash
# Always required
npm install @runloop/agent-axon-client @runloop/api-client

# Only for the Claude module
npm install @anthropic-ai/claude-agent-sdk
```

## ACP module — quick start

```typescript
import { ACPAxonConnection, PROTOCOL_VERSION } from "@runloop/agent-axon-client/acp";
import { RunloopSDK } from "@runloop/api-client";

const sdk = new RunloopSDK({ bearerToken: process.env.RUNLOOP_API_KEY });

// 1. Provision Axon + devbox with ACP broker mount
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
// Constructor opens SSE immediately and replays all events; pass afterSequence to resume
const conn = new ACPAxonConnection(axon, devbox, {
  onDisconnect: async () => {
    await devbox.shutdown();
  },
});

// 2. Initialize
await conn.initialize({
  protocolVersion: PROTOCOL_VERSION,
  clientInfo: { name: "my-app", version: "1.0.0" },
});

// 3. Listen for updates
conn.onSessionUpdate((sessionId, update) => {
  console.log(sessionId, update);
});

// 4. Create session and prompt
const session = await conn.newSession({ cwd: "/home/user", mcpServers: [] });
await conn.prompt({
  sessionId: session.sessionId,
  prompt: [{ type: "text", text: "Hello!" }],
});

// 5. Clean up
await conn.disconnect();
```

### ACP — narrowing session updates

```typescript
import {
  isAgentMessageChunk,
  isToolCall,
  isUsageUpdate,
} from "@runloop/agent-axon-client/acp";

conn.onSessionUpdate((sessionId, update) => {
  if (isAgentMessageChunk(update)) process.stdout.write(update.message);
  else if (isToolCall(update)) console.log(`Tool: ${update.toolName}`);
  else if (isUsageUpdate(update)) console.log("Tokens:", update);
});
```

Available guards: `isUserMessageChunk`, `isAgentMessageChunk`,
`isAgentThoughtChunk`, `isToolCall`, `isToolCallProgress`, `isPlan`,
`isAvailableCommandsUpdate`, `isCurrentModeUpdate`, `isConfigOptionUpdate`,
`isSessionInfoUpdate`, `isUsageUpdate`.

### ACP — key methods on `ACPAxonConnection`

| Method | Purpose |
|--------|---------|
| `initialize(params)` | Negotiate capabilities (call first) |
| `newSession(params)` | Create a conversation session |
| `prompt(params)` | Send a prompt |
| `cancel(params)` | Cancel an in-progress turn |
| `onSessionUpdate(listener)` | Subscribe to session updates (returns unsubscribe fn) |
| `onAxonEvent(listener)` | Subscribe to all Axon events (returns unsubscribe fn) |
| `abortStream()` | Abort the SSE stream without clearing listeners |
| `disconnect()` | Close the connection and run `onDisconnect` callback |

## Claude module — quick start

```typescript
import { ClaudeAxonConnection } from "@runloop/agent-axon-client/claude";
import { RunloopSDK } from "@runloop/api-client";

const sdk = new RunloopSDK({ bearerToken: process.env.RUNLOOP_API_KEY });

// 1. Provision infrastructure
const axon = await sdk.axon.create({ name: "claude-transport" });
const devbox = await sdk.devbox.create({
  mounts: [{
    type: "broker_mount",
    axon_id: axon.id,
    protocol: "claude_json",
    agent_binary: "claude",
  }],
});

// 2. Connect and initialize (replays all Axon events; pass afterSequence to resume)
const conn = new ClaudeAxonConnection(axon, devbox, { model: "claude-sonnet-4-5" });
await conn.connect();      // open transport + start read loop (replays events from beginning)
await conn.initialize();   // protocol handshake + set model

// 3. Send and receive
await conn.send("What files are in this directory?");
for await (const msg of conn.receiveResponse()) {
  console.log(msg.type, msg);
}

// 4. Clean up
await conn.disconnect();
```

### Claude — key methods on `ClaudeAxonConnection`

| Method | Purpose |
|--------|---------|
| `connect()` | Open transport and start the read loop; replays all events unless `afterSequence` was set |
| `initialize()` | Protocol handshake + optional model set (requires `connect()` first) |
| `send(prompt)` | Send a user message (`string` or `SDKUserMessage`) |
| `receiveResponse()` | Async iterator yielding messages until `result` |
| `receiveMessages()` | Async iterator yielding all messages indefinitely |
| `interrupt()` | Cancel the current turn |
| `onAxonEvent(listener)` | Subscribe to all Axon events (returns unsubscribe fn) |
| `abortStream()` | Abort the SSE stream without clearing listeners |
| `disconnect()` | Close transport + run `onDisconnect` callback |

## Event replay and `afterSequence`

Both modules subscribe to the Axon SSE stream, which **replays all events from
the beginning of the channel** by default. This means a new connection sees the
full history — useful for rebuilding UI state, but potentially expensive on
long-lived channels.

### Skipping already-seen events

Pass `afterSequence` in the connection options to start the SSE subscription
**after** a known sequence number. Only events with `sequence > afterSequence`
are delivered.

**Claude:**

```typescript
const conn = new ClaudeAxonConnection(axon, devbox, {
  afterSequence: 42, // skip events 0–42, receive 43+
});
await conn.connect();
```

**ACP:**

```typescript
const conn = new ACPAxonConnection(axon, devbox, {
  afterSequence: 42,
});
```

**Low-level `axonStream`:**

```typescript
const stream = axonStream({
  axon,
  afterSequence: 42,
});
```

### Tracking the sequence cursor

Every event delivered via `onAxonEvent` includes a `sequence` number
(`AxonEventView.sequence`). Persist the last sequence you processed and pass it
as `afterSequence` on the next connection to avoid replaying old events.

```typescript
let lastSeq: number | undefined;
conn.onAxonEvent((ev) => {
  lastSeq = ev.sequence;
});
// ... later, reconnect from where you left off:
const conn2 = new ACPAxonConnection(axon, devbox, { afterSequence: lastSeq });
```

### Automatic reconnect

If the SSE stream drops mid-session, the SDK automatically re-subscribes
**once** using the last-seen sequence number — no events are lost during a
transient disconnect. If the retry also fails, the connection is terminal;
create a new instance.

## Constraints and gotchas

- **Auto-reconnect (single retry).** If an SSE stream drops unexpectedly, the SDK re-subscribes once and logs a `console.warn`. If the retry also fails, the connection is terminal — create a new instance.
- **ACP permissions default to auto-approve** (`allow_always` > `allow_once` > first option). Pass `requestPermission` to customize.
- **Claude permissions also auto-approve** all tool use. Register a `"can_use_tool"` handler via `onControlRequest()` to customize.
- **Eager SSE** (ACP): The constructor opens an SSE subscription immediately and replays all events from the beginning of the channel (pass `afterSequence` to skip). Connection errors surface on the first awaited method call.
- **Node >= 22** required.
- **`@runloop/api-client`** is a peer dep — you must install it yourself.
- **`@anthropic-ai/claude-agent-sdk`** is an optional peer dep — only needed for the Claude module.
- **`prompt()` resolves before all session updates arrive.** The broker sends the prompt response and `turn.completed` system event *before* flushing thought/message chunks as `session/update` notifications. Use `onAxonEvent` to watch for `turn.started` / `turn.completed` system events to accurately bracket turn content. See the SDK README for details.
