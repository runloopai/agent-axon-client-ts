# @runloop/example-acp-cli

> **Alpha — subject to change.** This example uses an SDK in early development. APIs and behavior may change without notice between versions.

An interactive REPL for chatting with ACP-compatible agents (e.g. OpenCode) running in a Runloop devbox. Streams session updates — agent text, thinking, tool calls, plan entries, and usage — to the terminal in real time.

## Prerequisites

- Node.js 22+ / [Bun](https://bun.sh)
- A [Runloop](https://runloop.ai) API key

## Setup

```bash
# From the monorepo root
bun install && bun run build

# Set your API key
export RUNLOOP_API_KEY=your_key
```

## Running

```bash
bun run acp-cli.ts
bun run acp-cli.ts --agent opencode
VERBOSE=1 bun run acp-cli.ts
```

Or via the package script:

```bash
npm start
```

## Usage

Once running, type a message and press Enter to send it to the agent. Special commands:

| Input | Action |
|-------|--------|
| `exit` | Shut down and quit |
| `cancel` | Abort the current agent turn |

Use `VERBOSE=1` (or `--verbose`) to see thinking blocks, plan entries, tool progress, and token usage.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--agent <binary>` | `opencode` | Agent binary to run in the devbox |
| `--verbose` | `false` | Enable verbose output |
