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
  combined-app/           → Full-stack combined demo (Claude + ACP, Express + React)
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
bun run typecheck    # type-check src + tests (no emit)
```

## Key constraints

- Node >= 22 required
- ESM-only (`"type": "module"` everywhere)
- `@runloop/api-client` is a required peer dependency of the SDK
- `@anthropic-ai/claude-agent-sdk` is an optional peer dep (Claude module only)
- Conventional commits enforced on PR titles

## Pre-push checks

After editing any file under `sdk/src/`, and before committing, pushing, or declaring a task complete, run all four in order:

```bash
bun run check      # Biome lint + format
bun run typecheck  # Type-check src + tests (no emit)
bun run build      # TypeScript compilation
bun run test       # Vitest suite
```

If any step fails, fix the issue and re-run from that step. Common Biome fixes:

- **Import sorting** — third-party imports first, then relative paths alphabetically.
- **Type-only imports** — use `import { type Foo } from "bar"` when `Foo` is only used as a type.
- **Formatting** — run `bun run check` to see the exact diff Biome expects.

## Pull request conventions

PR titles **must** follow Conventional Commits:

```
<type>(<scope>): <description>
```

| Types  | `feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `build` · `ci` · `chore` · `revert` |
|--------|---|
| Scopes | `sdk` · `acp` · `claude` · `examples` · `deps` · `project` |

PR body must use this template:

```markdown
## What
<1-3 bullet points describing the changes>

## Why
<Motivation and context>

## Checklist
- [ ] PR title follows `<type>(<scope>): <description>` format
- [ ] `bun run check` passes (lint + format)
- [ ] `bun run build` passes
- [ ] `bun run test` passes
- [ ] SDK documentation updated (if applicable)
```

Check off items that have been verified before submitting.
