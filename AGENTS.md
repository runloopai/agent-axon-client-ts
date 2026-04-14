# AGENTS.md — agent-axon-client-ts monorepo

> **Audience:** This file is intended for AI agents that are developing or maintaining code *in this repository*. It is not end-user documentation — it provides the conventions, tooling, and constraints an agent needs to work effectively in this monorepo.

For detailed SDK API docs see [`sdk/AGENTS.md`](sdk/AGENTS.md).

## Recipes for common SDK use cases

The `agent-examples/` directory contains runnable recipes that demonstrate how to use `@runloop/agent-axon-client` for common scenarios. **Start with [`llms.txt`](llms.txt)** — it is the generated index of all available use cases, compatibility constraints, and implementation guidance. Use it to find the right recipe before writing new integration code from scratch.

Workflow:

1. Read `llms.txt` to identify which use case matches your task.
2. Follow its pointers to the relevant file in `agent-examples/src/use-cases/`.
3. Check `agent-examples/compatibility.md` if you need to verify protocol/agent support.

The use-case list in `llms.txt` is auto-generated from `agent-examples/templates/llms.txt.template`. Regenerate it by running `bun run compat` (without filters).

## Repository layout

```
sdk/                      → @runloop/agent-axon-client (published npm package)
agent-examples/           → Runnable recipes for common SDK use cases (see above)
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
bun run check:fix    # lint + format auto-fix (SDK)
bun run typecheck    # type-check src + tests (no emit)
```

## Git safety

- **Never use `git stash pop`** (or `git stash apply`) during debugging or any automated workflow. Other agents may be running concurrently on the same worktree, and popping the stash can overwrite their in-progress changes or introduce merge conflicts that silently corrupt files.

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

After editing any file under `agent-examples/`, also run:

```bash
bun run --filter 'agent-examples' typecheck  # Type-check agent-examples
```

If any step fails, fix the issue and re-run from that step.

If `bun run check` fails, run `bun run check:fix` to auto-fix most lint and format issues, then re-run `bun run check` to confirm. Common Biome issues:

- **Import sorting** — third-party imports first, then relative paths alphabetically.
- **Type-only imports** — use `import { type Foo } from "bar"` when `Foo` is only used as a type.
- **Formatting** — `check:fix` handles this automatically.

## Pull request conventions

PR titles **must** follow Conventional Commits:

```
<type>(<scope>): <description>
```

| Types  | `feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `build` · `ci` · `chore` · `revert` |
|--------|---|
| Scopes | `sdk` · `acp` · `claude` · `examples` · `agent-examples` · `deps` · `project` |

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
