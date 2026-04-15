# Agent Axon Client — Compatibility Matrix

Generated: 2026-04-14T23:18:48.079Z
SDK Version: 0.4.0

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
| opencode | elicitation-acp | xfail | 11.3s | [xfail: ACP protocol has not added full elicitation support yet] Agent did not trigger session_elicitation |
| opencode | single-prompt | pass | 10.4s |  |
| claude-code | elicitation-claude | pass | 6.6s |  |
| claude-code | single-prompt | pass | 4.9s |  |
