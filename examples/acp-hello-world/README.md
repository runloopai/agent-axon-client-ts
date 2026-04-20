# @runloop/example-acp-hello-world

> **Alpha — subject to change.** This example uses an SDK in early development. APIs and behavior may change without notice between versions.

The minimal starting point for using the ACP module. Provisions a Runloop devbox, connects via the [Agent Client Protocol](https://agentclientprotocol.com), and sends a single prompt.

This shows you how to start an axon and attach it to a devbox and register lifecycle event hooks.

## Prerequisites

- Node.js 22+ / [Bun](https://bun.sh)
- A [Runloop](https://runloop.ai) API key

## Setup

```bash
# From the monorepo root
bun install && bun run build

# Set your API key
export RUNLOOP_API_KEY=your_key

# Build the shared `axon-agents` blueprint (one-time, required)
bun run build-blueprint
```

> This example creates a devbox with `blueprint_name: "axon-agents"`. The blueprint must be built once on your Runloop account before this example will work — otherwise `devbox.create()` will fail. See [`../blueprint`](../blueprint/) for details.

## Running

```bash
npm start
# or
bun run acp-hello-world.ts
```

## What it does

1. Creates an Axon channel and a Runloop devbox with an ACP-compatible agent
2. Initializes the ACP connection
3. Creates a session and sends a single prompt
4. Streams the agent's response to stdout
5. Shuts down the devbox

For a full interactive REPL, see [`../acp-cli`](../acp-cli/).
