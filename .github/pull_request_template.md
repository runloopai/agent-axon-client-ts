## What

<!-- Brief description of the changes -->

## Why

<!-- Motivation and context -->

## PR title format

<!--
  PR titles must follow Conventional Commits: <type>(<scope>): <description>

  Types:  feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert
  Scopes: sdk | acp | claude | examples | deps | project
  
  Examples:
    feat(sdk): add reconnect support
    fix(acp): handle timeout on long-running tasks
    docs(claude): update connection examples
    deps(sdk): bump @runloop/api-client to 1.5.0
    ci(project): add PR title validation workflow
-->

## Checklist

- [ ] PR title follows `<type>(<scope>): <description>` format (see above)
- [ ] `bun run check` passes (lint + format)
- [ ] `bun run build` passes
- [ ] `bun run test` passes
- [ ] SDK documentation updated (if applicable)
