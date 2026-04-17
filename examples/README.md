# Examples

> **Alpha — subject to change.** These examples use an SDK in early development. APIs and behavior may change without notice between versions.

Example applications and scripts showing how to use `@runloop/agent-axon-client` to connect to coding agents running in [Runloop](https://runloop.ai) devboxes.

## Examples

| Directory | Description |
|-----------|-------------|
| [`blueprint`](blueprint/) | **Run this first.** Builds the shared `axon-agents` Runloop blueprint that every other example depends on |
| [`acp-hello-world`](acp-hello-world/) | Minimal ACP agent script — the simplest possible starting point |
| [`acp-cli`](acp-cli/) | Interactive REPL for ACP-compatible agents (e.g. OpenCode) |
| [`claude-hello-world`](claude-hello-world/) | Minimal Claude agent script — the simplest possible starting point |
| [`claude-cli`](claude-cli/) | Interactive REPL for Claude Code agents |
| [`combined-app`](combined-app/) | Full-stack combined demo (Claude + ACP) with a unified React UI |
| [`feature-examples`](feature-examples/) | Runnable SDK recipes (single-prompt, elicitation, etc.) |

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

### Build the shared blueprint (required, one-time)

All examples create devboxes with `blueprint_name: "axon-agents"`. That blueprint is produced by the [`blueprint`](blueprint/) example and must exist on your Runloop account before any other example will succeed — otherwise devbox creation will fail.

From the monorepo root:

```bash
export RUNLOOP_API_KEY=your_key
bun run build-blueprint
```

Wait for the script to print `Blueprint build complete.`. You only need to do this once per account; re-run it to pick up changes to [`blueprint/Dockerfile`](blueprint/Dockerfile).

See [`blueprint/README.md`](blueprint/README.md) for more detail, including what's baked into the image and alternatives to using a blueprint.

### Run an example

Each example reads `RUNLOOP_API_KEY` (and `ANTHROPIC_API_KEY` where needed) from the environment. Export them, or add a `.env` file in the example directory.

See each example's own README for specific run instructions.
