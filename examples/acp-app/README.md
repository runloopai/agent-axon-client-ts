# @runloop/example-acp-app

> **Alpha — subject to change.** This example uses an SDK in early development. APIs and behavior may change without notice between versions.

A full-stack demo app for interacting with ACP agents running in Runloop devboxes. The UI is modeled after Cursor's chat interface — streaming thinking blocks, inline tool calls with diffs and terminal output, markdown-rendered responses, and a plan view.

This example showcases key features when working with axons:

- authentication
- permissions management
- session switching
- mixed media and multimodal operations
- lifecycle operations, including cancelation and config option changes

## Prerequisites

- Node.js 22+ (uses `--experimental-strip-types` and `--env-file`)
- A [Runloop](https://runloop.ai) API key
- The `@runloop/agent-axon-client` SDK built locally (`cd ../../sdk && bun run build`)

## Setup

```bash
# From the monorepo root
bun install

# Build the SDK
bun run build

# Configure your API key
cd examples/acp-app
cp .env.example .env   # or create .env manually
```

Add to `.env`:

```
RUNLOOP_API_KEY=your_runloop_api_key
```

## Running

You need two terminals:

```bash
# Terminal 1: Express server (port 3001)
npm run dev

# Terminal 2: Vite dev server (port 5174)
npm run dev:client
```

Open http://localhost:5174. The Vite dev server proxies `/api/*` and `/ws` to the Express backend.

### Production build

```bash
npm run build      # type-check + vite build → dist/client/
npm run dev        # serves the built client from dist/
```

## How It Works

### End-to-end flow

```
Browser (React)           Node Server (Express)          Runloop Cloud
     │                          │                             │
     │  POST /api/start         │                             │
     │─────────────────────────►│  sdk.axon.create()          │
     │                          │─────────────────────────────►│
     │                          │  sdk.devbox.create()        │
     │                          │─────────────────────────────►│
     │                          │  axonStream() ◄── SSE ──────│
     │                          │  connection.initialize()     │
     │                          │  connection.newSession()     │
     │◄─────────────────────────│  { sessionId, modes, ... }  │
     │                          │                             │
     │  WS connect /ws          │                             │
     │◄════════════════════════►│                             │
     │                          │                             │
     │  POST /api/prompt        │                             │
     │─────────────────────────►│  connection.prompt() ──────►│
     │  { ok: true }            │  (fire-and-forget)          │
     │                          │                             │
     │  ◄── WS: session_update ─┤◄── agent thinking ─────────│
     │  ◄── WS: session_update ─┤◄── tool_call ──────────────│
     │  ◄── WS: session_update ─┤◄── agent_message_chunk ────│
     │  ◄── WS: turn_complete ──┤  prompt() resolved          │
```

1. **Create Sandbox** — the server provisions an Axon (message bus) and Devbox (sandbox) via the Runloop SDK, then initializes the ACP protocol and creates a session.

2. **Send a prompt** — the server fires `connection.prompt()` without waiting for it, returning immediately. The agent's turn plays out asynchronously.

3. **Stream events** — as the agent works, `session/update` notifications flow through the Axon SSE stream → `NodeACPClient.sessionUpdate()` → WebSocket broadcast → React hook processes them into `TurnBlock[]` and renders in real-time.

4. **Turn completion** — when `connection.prompt()` resolves, the server broadcasts `turn_complete` over WebSocket. The client finalizes the accumulated blocks into a chat message.

5. **Agent callbacks** — during a turn the agent may request file reads/writes and terminal operations. The `NodeACPClient` handles these locally on the server and broadcasts the activity to the client for the sidebar.

### Architecture

```
┌─ Browser ──────────────────────────────┐
│                                        │
│  useNodeAgent (hook)                   │
│    ├─ HTTP: /api/* calls               │
│    ├─ WS: event stream consumer        │
│    └─ State: messages, blocks, sidebar │
│                                        │
│  App.tsx (UI)                          │
│    ├─ AssistantTurn → TurnBlock views  │
│    ├─ ThinkingBlockView                │
│    ├─ ToolCallBlockView                │
│    ├─ TextBlockView (markdown)         │
│    ├─ PlanBlockView                    │
│    └─ Sidebars (sessions, activity)    │
└────────────────────────────────────────┘
        │ HTTP + WS
        ▼
┌─ Node Server ──────────────────────────┐
│                                        │
│  Express (REST endpoints)              │
│  WsBroadcaster (one-way push)          │
│  NodeACPClient                         │
│    ├─ sessionUpdate → WS broadcast     │
│    ├─ readTextFile / writeTextFile     │
│    ├─ terminal ops (TerminalManager)   │
│    └─ requestPermission (auto-approve) │
│  ClientSideConnection (ACP SDK)        │
│    └─ axonStream (@runloop/agent-axon-client/acp)│
└────────────────────────────────────────┘
        │ SSE + HTTP
        ▼
┌─ Runloop Cloud ────────────────────────┐
│  Axon (event bus)                      │
│  Devbox (sandbox)                      │
│  Agent (opencode, claude, etc.)        │
└────────────────────────────────────────┘
```

## Server API

All endpoints accept/return JSON.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/start` | Provision Axon + Devbox, initialize ACP, create session. Body: `{ agentBinary?, launchArgs?, launchCommands? }`. Returns `{ sessionId, devboxId, axonId, modes, configOptions }`. |
| `POST` | `/api/prompt` | Send a prompt. Body: `{ text }`. Returns `{ ok: true }` immediately — turn results arrive over WebSocket. |
| `POST` | `/api/cancel` | Cancel the current agent turn. |
| `POST` | `/api/set-mode` | Switch agent mode. Body: `{ modeId }`. Valid modes: `implement`, `plan`, `ask`, `debug`. |
| `POST` | `/api/set-config-option` | Update a config option. Body: `{ configId, value }`. |
| `POST` | `/api/new-session` | Create a new session (reuses the existing connection). |
| `POST` | `/api/switch-session` | Load a previous session. Body: `{ sessionId }`. |
| `GET`  | `/api/sessions` | List all sessions. |
| `GET`  | `/api/axon-events` | Get raw Axon event history (debugging). |
| `POST` | `/api/shutdown` | Tear down the devbox and close the connection. |

## WebSocket Events

The server pushes events to all connected clients at `/ws`. All messages are JSON with a `type` field.

### Turn lifecycle

| Type | When | Payload |
|------|------|---------|
| `turn_complete` | Agent's turn finished | Prompt response fields |
| `turn_error` | Agent's turn failed | `{ error: string }` |

### ACP session updates

Type `session_update` with a nested `update.sessionUpdate` discriminator:

| `sessionUpdate` | Description |
|-----------------|-------------|
| `agent_thought_chunk` | Streaming thinking/reasoning text |
| `agent_message_chunk` | Streaming response text |
| `tool_call` | Agent invoked a tool (read, edit, execute, search, etc.) |
| `tool_call_update` | Tool execution progress or completion |
| `plan` | Agent's plan with entries |
| `usage_update` | Token usage and cost |
| `current_mode_update` | Mode changed |
| `turn_start` / `turn_end` | Turn boundaries |

### Agent callbacks

| Type | Description |
|------|-------------|
| `file_read` | Agent read a file: `{ path, lines }` |
| `file_write` | Agent wrote a file: `{ path, bytes }` |
| `terminal_create` | Agent spawned a terminal: `{ terminalId, command }` |
| `terminal_output` | Terminal output captured: `{ terminalId, output, exited }` |
| `terminal_kill` / `terminal_release` | Terminal lifecycle |
| `permission` | Permission auto-approved: `{ title, outcome }` |

### Raw Axon events

| Type | Description |
|------|-------------|
| `axon_event` | Every raw Axon event (for debugging/inspection) |

## UI Features

- **Block-based chat** — assistant turns render as ordered blocks (thinking, tool calls, text, plans) rather than a flat message stream
- **Thinking blocks** — collapsible, auto-expand while active, show duration when complete
- **Tool call cards** — color-coded by kind (read/edit/delete/execute/search/fetch), show status spinners, file paths, expandable diff and terminal output
- **Markdown rendering** — agent text renders with headings, code blocks, lists, links, blockquotes
- **Streaming cursor** — blinking cursor during active text streaming
- **Mode switcher** — toggle between implement, plan, ask, and debug modes
- **Session management** — create new sessions, switch between existing ones, session list sidebar
- **Activity sidebar** — tool activity feed, local file operations, terminal output panels
- **Axon event viewer** — raw event inspector with color-coded origins, expandable payloads, copy buttons

## Project Structure

```
src/
├── server/
│   ├── index.ts              Express server, all REST endpoints
│   ├── acp-client.ts         NodeACPClient (ACP Client implementation)
│   ├── ws.ts                 WebSocket broadcaster
│   └── terminal-manager.ts   Local child process manager
└── client/
    ├── main.tsx              React entry point
    ├── App.tsx               All UI components
    ├── App.css               Dark theme stylesheet
    └── hooks/
        └── useNodeAgent.ts   State management, WS handling, API calls
```

## License

MIT — part of the [`agent-axon-client`](https://github.com/runloopai/agent-axon-client-ts) workspace.
