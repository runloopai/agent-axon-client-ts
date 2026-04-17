# @runloop/example-claude-hello-world

> **Alpha — subject to change.** This example uses an SDK in early development. APIs and behavior may change without notice between versions.

The minimal starting point for using the Claude module. Provisions a Runloop devbox running Claude Code, sends a single prompt, and streams the response.

## Prerequisites

- Node.js 22+ / [Bun](https://bun.sh)
- A [Runloop](https://runloop.ai) API key
- An [Anthropic](https://anthropic.com) API key

## Setup

```bash
# From the monorepo root
bun install && bun run build

# Set your API keys
export RUNLOOP_API_KEY=your_runloop_key
export ANTHROPIC_API_KEY=your_anthropic_key

# Build the shared `axon-agents` blueprint (one-time, required)
bun run build-blueprint
```

> This example creates a devbox with `blueprint_name: "axon-agents"`. The blueprint must be built once on your Runloop account before this example will work — otherwise `devbox.create()` will fail. See [`../blueprint`](../blueprint/) for details.

## Running

```bash
npm start
# or
bun run claude-hello-world.ts
```

## What it does

1. Creates an Axon channel and a Runloop devbox running Claude Code
2. Connects via `ClaudeAxonConnection`
3. Sends a single prompt
4. Streams the response to stdout
5. Disconnects and shuts down the devbox

For a full interactive REPL, see [`../claude-cli`](../claude-cli/).
