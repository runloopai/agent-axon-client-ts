# Agent Axon Client — Compatibility Matrix

Generated: 2026-04-16T15:46:45.633Z
SDK Version: 0.4.1

## Protocol × Feature

| Use Case | ACP | Claude |
|----------|-----|--------|
| elicitation-acp | xfail | N/A |
| elicitation-claude | N/A | pass |
| single-prompt | pass | pass |

## ACP Agent × Feature

| Use Case | opencode |
|----------|------------|
| elicitation-acp | xfail |
| single-prompt | pass |

---

## Run Details

| Agent | Use Case | Status | Duration | Notes |
|-------|----------|--------|----------|-------|
| opencode | elicitation-acp | xfail | 12.0s | [xfail: ACP protocol has not added full elicitation support yet] Agent did not trigger session_elicitation |
| opencode | single-prompt | pass | 7.0s |  |
| claude-code | elicitation-claude | pass | 7.4s |  |
| claude-code | single-prompt | pass | 4.5s |  |
