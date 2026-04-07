# Examples

> **Alpha — subject to change.** These examples use an SDK in early development. APIs and behavior may change without notice between versions.

Example applications and scripts showing how to use `@runloop/agent-axon-client` to connect to coding agents running in [Runloop](https://runloop.ai) devboxes.

## Examples

| Directory | Description |
|-----------|-------------|
| [`acp-hello-world`](acp-hello-world/) | Minimal ACP agent script — the simplest possible starting point |
| [`acp-cli`](acp-cli/) | Interactive REPL for ACP-compatible agents (e.g. OpenCode) |
| [`acp-app`](acp-app/) | Full-stack ACP demo with a React UI modeled after Cursor's chat interface |
| [`claude-hello-world`](claude-hello-world/) | Minimal Claude agent script — the simplest possible starting point |
| [`claude-cli`](claude-cli/) | Interactive REPL for Claude Code agents |
| [`claude-app`](claude-app/) | Full-stack Claude demo with a React UI |
| [`combined-app`](combined-app/) | Full-stack combined demo (Claude + ACP) with a unified React UI |

## Prerequisites

- Node.js 22+
- [Bun](https://bun.sh)
- A [Runloop](https://runloop.ai) API key (`RUNLOOP_API_KEY`)
- An Anthropic API key (`ANTHROPIC_API_KEY`) — required for Claude examples

## Setup

Install all dependencies from the monorepo root:

```bash
bun install
bun run build
```

Each example reads `RUNLOOP_API_KEY` (and `ANTHROPIC_API_KEY` where needed) from the environment. Export them, or add a `.env` file in the example directory.

See each example's own README for specific run instructions.
