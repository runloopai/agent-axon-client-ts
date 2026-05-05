# @runloop/example-claude-cli

> **Alpha — subject to change.** This example uses an SDK in early development. APIs and behavior may change without notice between versions.

An interactive REPL for chatting with Claude Code running in a Runloop devbox. Streams assistant messages, thinking blocks, tool calls, and turn summaries to the terminal in real time.

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
bun run claude-cli.ts
bun run claude-cli.ts --model claude-haiku-4-5
VERBOSE=1 bun run claude-cli.ts
```

Or via the package script:

```bash
npm start
```

## Usage

Once running, type a message and press Enter to send it to Claude. Type `exit` to quit.

Use `VERBOSE=1` (or `--verbose`) to see thinking blocks, tool call details, and task progress.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--model <id>` | _(agent default)_ | Claude model to use (e.g. `claude-haiku-4-5`) |
| `--system-prompt <text>` | _(agent default)_ | Override the system prompt |
| `--verbose` | `false` | Enable verbose output |
