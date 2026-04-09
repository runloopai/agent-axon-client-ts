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
```

## Running

```bash
npm start
# or
bun run claude-hello-world.ts
```

## What it does

1. Sets up an Agent Gateway to securely proxy Anthropic API requests
2. Creates an Axon channel and a Runloop devbox running Claude Code
3. Connects via `ClaudeAxonConnection`
4. Sends a single prompt
5. Streams the response to stdout
6. Disconnects, cleans up the gateway secret, and shuts down the devbox

## Agent Gateway

This example uses [Agent Gateway](https://docs.runloop.ai/docs/devboxes/agent-gateways) to securely proxy Anthropic API requests. Your real API key is never exposed to the devbox — it receives only a gateway URL and temporary token. The temporary secret is automatically cleaned up when the script exits.

For a full interactive REPL, see [`../claude-cli`](../claude-cli/).
For a full-stack UI demo, see [`../claude-app`](../claude-app/).
