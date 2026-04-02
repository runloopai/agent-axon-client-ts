# @runloop/example-claude-app

> **Alpha — subject to change.** This example uses an SDK in early development. APIs and behavior may change without notice between versions.

A full-stack demo app for chatting with Claude Code running in a Runloop devbox. An Express backend manages the Claude connection and streams SDK messages to a React frontend over WebSocket.

## Prerequisites

- Node.js 22+
- A [Runloop](https://runloop.ai) API key
- An [Anthropic](https://anthropic.com) API key
- The `@runloop/agent-axon-client` SDK built locally (`cd ../../sdk && bun run build`)

## Setup

```bash
# From the monorepo root
bun install && bun run build

# Configure your API keys
cd examples/claude-app
cp .env.example .env   # or create .env manually
```

Add to `.env`:

```
RUNLOOP_API_KEY=your_runloop_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
RUNLOOP_BASE_URL=https://api.runloop.ai   # optional, this is the default
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

1. **Connect** — the browser calls `POST /api/connect`, which provisions an Axon channel and a Runloop devbox running Claude Code, then opens a `ClaudeSDKConnection`.
2. **Send a prompt** — `POST /api/prompt` calls `conn.send()` and returns immediately. The agent's response streams in the background.
3. **Stream messages** — as Claude responds, SDK messages flow through the Axon SSE stream to the server's read loop, which broadcasts each message over WebSocket to the browser.
4. **Turn completion** — when a `result` message arrives, the server also broadcasts a `turn_complete` event so the client knows the turn is done.

## Server API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/connect` | Provision Axon + Devbox, connect Claude. Body: `{ model? }`. Returns `{ axonId, devboxId }`. |
| `POST` | `/api/prompt` | Send a prompt. Body: `{ text }`. Returns `{ ok: true }` immediately. |
| `POST` | `/api/interrupt` | Interrupt the current turn. |
| `POST` | `/api/disconnect` | Disconnect and shut down the devbox. |
| `GET`  | `/api/status` | Connection status and init message. |

## WebSocket Events

All messages are JSON with a `type` field, pushed to clients at `/ws`.

| Type | Description |
|------|-------------|
| `sdk_message` | Raw `SDKMessage` from `@anthropic-ai/claude-agent-sdk` |
| `turn_complete` | Emitted when a `result` message arrives |
| `turn_error` | Emitted when an error occurs during a turn |

## Project Structure

```
src/
├── server/
│   ├── index.ts     Express server and REST endpoints
│   └── ws.ts        WebSocket broadcaster
└── client/
    ├── main.tsx     React entry point
    └── App.tsx      UI components
```

## License

MIT — part of the [`agent-axon-client`](https://github.com/runloopai/agent-axon-client-ts) workspace.
