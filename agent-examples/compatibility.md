# Agent Axon Client — Compatibility Matrix

Generated: 2026-04-14T17:06:20.439Z
SDK Version: 0.4.0

## Protocol × Feature

| Use Case | ACP | Claude |
|----------|-----|--------|
| elicitation | fail | pass |
| single-prompt | pass | pass |

## ACP Agent × Feature

| Use Case | opencode |
|----------|------------|
| elicitation | fail |
| single-prompt | pass |

---

## Run Details

| Agent | Use Case | Status | Duration | Notes |
|-------|----------|--------|----------|-------|
| opencode | elicitation | fail | 9.8s | Agent did not trigger elicitation |
| opencode | single-prompt | pass | 10.1s |  |
| claude-code | elicitation | pass | 9.1s |  |
| claude-code | single-prompt | pass | 8.8s |  |
