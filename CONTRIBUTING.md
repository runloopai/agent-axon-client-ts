# Contributing

Thanks for your interest in contributing to `@runloop/agent-axon-client`.

## Prerequisites

- [Node.js](https://nodejs.org) >= 22
- [Bun](https://bun.sh) (package manager and task runner)

## Getting Started

```bash
git clone git@github.com:runloopai/agent-axon-client-ts.git
cd agent-axon-client-ts
bun install
bun run build
```

## Repository Structure

This is a Bun workspaces monorepo:

- **`sdk/`** — The published `@runloop/agent-axon-client` package. All SDK source lives in `sdk/src/`.
- **`examples/`** — Example applications that consume the SDK. These are private packages and are not published.

## Development Workflow

### Working on the SDK

```bash
# Build the SDK
bun run build

# Watch mode (rebuilds on changes)
bun run --filter '@runloop/agent-axon-client' dev

# Run tests
bun run test

# Run tests in watch mode
bun run --filter '@runloop/agent-axon-client' test:watch

# Lint and format check
bun run check

# Auto-fix lint and formatting issues
bun run --filter '@runloop/agent-axon-client' check:fix
```

### Working on examples

Each example app has its own dev server:

```bash
bun run --filter '@runloop/example-acp-app' dev     # ACP example
bun run --filter '@runloop/example-claude-app' dev  # Claude example
```

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and [Release Please](https://github.com/googleapis/release-please) for automated versioning and changelog generation.

**Do not manually bump versions.** Release Please handles this automatically based on commit messages merged to `main`.

### Commit message format

```
<type>(<scope>): <description>

[optional body]
```

Common types:

| Type | Description | Version bump |
|------|-------------|--------------|
| `feat` | A new feature | Minor |
| `fix` | A bug fix | Patch |
| `docs` | Documentation changes | None |
| `refactor` | Code change that neither fixes a bug nor adds a feature | None |
| `test` | Adding or updating tests | None |
| `chore` | Maintenance tasks | None |

Breaking changes: add `!` after the type (e.g., `feat!: remove deprecated API`) or include `BREAKING CHANGE:` in the commit body. This triggers a major version bump.

### Examples

```
feat(acp): add session reconnection support
fix(claude): handle transport disconnect during read loop
docs: update README with Claude module examples
test(acp): add unit tests for session update type guards
```

## Pull Requests

1. Create a feature branch from `main`.
2. Make your changes and ensure all checks pass:
   ```bash
   bun run check   # lint + format
   bun run build   # type check
   bun run test    # tests
   ```
3. Write a clear PR description explaining what changed and why.
4. Request a review.

CI will automatically run lint, build, and test checks on your PR.
