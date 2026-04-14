# Agent Axon Client — Compatibility Matrix

Generated: 2026-04-14T21:53:31.650Z
SDK Version: 0.4.0

## Protocol × Feature

| Use Case | ACP | Claude |
|----------|-----|--------|
| elicitation-acp | fail | N/A |
| elicitation-claude | N/A | pass |
| single-prompt | pass | pass |

## ACP Agent × Feature

| Use Case | opencode |
|----------|------------|
| elicitation-acp | fail |
| single-prompt | pass |

---

## Run Details

| Agent | Use Case | Status | Duration | Notes |
|-------|----------|--------|----------|-------|
| opencode | elicitation-acp | fail | 11.9s | Agent did not trigger session_elicitation |
| opencode | single-prompt | pass | 6.7s |  |
| claude-code | elicitation-claude | pass | 5.3s |  |
| claude-code | single-prompt | pass | 5.3s |  |
