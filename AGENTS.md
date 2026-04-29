# AGENTS.md — remote-agents-sdk

Repo guide for AI agents. SDK API docs: [`sdk/AGENTS.md`](sdk/AGENTS.md).

## Layout

- `sdk/` — `@runloop/remote-agents-sdk` (published package)
- `examples/feature-examples/` — runnable SDK recipes
- `examples/` — demo apps (hello-world, CLI, full-stack)

## Recipes workflow

1. Read [`llms.txt`](llms.txt) for the use-case index.
2. Open matching file in `examples/feature-examples/src/use-cases/`.
3. Check `examples/feature-examples/compatibility.md` for protocol/agent support.

Regenerate generated docs: `bun run feature-compat` (no filters).

## Commands

```bash
bun install        # install deps
bun run build      # build SDK
bun run test       # run tests
bun run check      # lint + format
bun run check:fix  # auto-fix lint/format
bun run typecheck  # type-check (no emit)
```

## Constraints

- Node >= 22, ESM-only
- `@runloop/api-client` required peer; `@anthropic-ai/claude-agent-sdk` optional (Claude module)
- Never `git stash pop` or `git stash apply` (concurrent agent safety)

## Before commit/push

After `sdk/src/` edits run in order: `check` → `typecheck` → `build` → `test`.

After `examples/feature-examples/` edits also run:

```bash
bun run --filter 'feature-examples' typecheck
```

## PR titles

Conventional Commits: `<type>(<scope>): <description>`

## Checklist
- [ ] PR title follows `<type>(<scope>): <description>` format
- [ ] `bun run check` passes (lint + format)
- [ ] `bun run build` passes
- [ ] `bun run test` passes
- [ ] SDK documentation updated (if applicable)
```

Scopes: `sdk` · `acp` · `claude` · `examples` · `deps` · `project`
