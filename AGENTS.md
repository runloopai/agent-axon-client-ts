# AGENTS.md — agent-axon-client-ts monorepo

> Repository-level reference for AI coding agents. For detailed SDK API docs see [`sdk/AGENTS.md`](sdk/AGENTS.md).

## Repository layout

```
sdk/                      → @runloop/agent-axon-client (published npm package)
examples/
  acp-hello-world/        → Minimal ACP single-prompt script
  acp-cli/                → Interactive ACP REPL
  acp-app/                → Full-stack ACP demo (Express + React)
  claude-hello-world/     → Minimal Claude single-prompt script
  claude-cli/             → Interactive Claude REPL
  claude-app/             → Full-stack Claude demo (Express + React)
```

## Monorepo tooling

- **Package manager:** Bun (workspaces in root `package.json`)
- **Linter/formatter:** Biome (`biome.json`, scoped to `sdk/src/**`)
- **Tests:** Vitest (`sdk/vitest.config.ts`), run with `bun run test`
- **Build:** TypeScript `tsc` (`sdk/tsconfig.json`), run with `bun run build`
- **Git hooks:** Husky + lint-staged (pre-commit runs Biome on staged SDK files)
- **Releases:** Release Please + npm publish via GitHub Actions
- **CI:** GitHub Actions — lint, build, typecheck, test with coverage (Node 22 + 24 matrix)

## Common commands

```bash
bun install          # install all workspace dependencies
bun run build        # build the SDK
bun run test         # run SDK tests
bun run check        # lint + format check (SDK)
```

## Key constraints

- Node >= 22 required
- ESM-only (`"type": "module"` everywhere)
- `@runloop/api-client` is a required peer dependency of the SDK
- `@anthropic-ai/claude-agent-sdk` is an optional peer dep (Claude module only)
- Conventional commits enforced on PR titles
