# feature-examples

Runnable SDK recipes demonstrating individual features of `@runloop/agent-axon-client`. **Primary audience: agents** (LLM code generators looking for working examples).

## Prerequisites

Most use cases run against `runloop/starter-x86_64` and show how to load an angent using agent mounts without setup. The `agent-via-blueprint` use case demonstrates how to build an agent into a blueprint for faster loading. The shared `axon-agents` blueprint demonstrates this flow — build it once from the repo root before running the full suite:

```bash
bun run build-blueprint
```

See [`../blueprint`](../blueprint/) for details.

## Layout

- [`src/scaffold.ts`](src/scaffold.ts) — Devbox provisioning and connection setup. Read this first to understand how agents are launched.
- [`src/agents.ts`](src/agents.ts) — Agent configurations (blueprint, binary paths, secrets).
- [`src/types.ts`](src/types.ts) — Type definitions for use cases, including `provisionOverridesByAgent` for per-agent configuration.
- [`src/use-cases/`](src/use-cases/) — Individual feature demonstrations (one file per use case).
- [`compatibility.md`](compatibility.md) — Generated compatibility matrix (protocol × agent × feature).

## Running

```bash
bun run feature-compat              # Run all use cases, regenerate compatibility.md and llms.txt
bun run feature-compat --agent opencode   # Run only with opencode
bun run feature-compat --use-case single-prompt  # Run only single-prompt
bun run feature-compat --validate   # Validate generated files without running tests
```

## Per-agent overrides

Use cases can specify `provisionOverridesByAgent` to configure different blueprint, binary paths, or other settings per agent. See [`agent-via-blueprint.ts`](src/use-cases/agent-via-blueprint.ts) for an example that demonstrates explicit blueprint configuration.

## Use-case index

See [`llms.txt`](../../llms.txt) at the repo root for the canonical index of use cases with links.
