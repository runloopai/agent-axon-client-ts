# Agent Axon Client — Compatibility Matrix

SDK Version: 0.4.2

## Protocol × Feature

| Use Case | ACP | Claude |
|----------|-----|--------|
| agent-via-blueprint | pass | pass |
| elicitation-acp | xfail | N/A |
| elicitation-claude | N/A | pass |
| single-prompt | pass | pass |

## ACP Agent × Feature

| Use Case | opencode | codex-acp |
|----------|------------|------------|
| agent-via-blueprint | pass | pass |
| elicitation-acp | xfail | xfail |
| single-prompt | pass | pass |

---

## Run Details

| Agent | Use Case | Status | Duration | Notes |
|-------|----------|--------|----------|-------|
| opencode | agent-via-blueprint | pass | 2.4s |  |
| opencode | elicitation-acp | xfail | 7.0s | [xfail: ACP protocol has not added full elicitation support yet] Agent did not trigger session_elicitation |
| opencode | single-prompt | pass | 2.5s |  |
| codex-acp | agent-via-blueprint | pass | 1.8s |  |
| codex-acp | elicitation-acp | xfail | 8.9s | [xfail: codex-acp does not advertise or send session/elicitation (uses permission requests instead)] Agent did not trigger session_elicitation |
| codex-acp | single-prompt | pass | 2.4s |  |
| claude-code | agent-via-blueprint | pass | 1.9s |  |
| claude-code | elicitation-claude | pass | 11.8s |  |
| claude-code | single-prompt | pass | 2.6s |  |
