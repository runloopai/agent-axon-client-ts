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
| opencode | elicitation-acp | xfail | 10.0s | [xfail: ACP protocol has not added full elicitation support yet] Timeout (10000ms): elicitation-acp execution |
| opencode | single-prompt | pass | 1.9s |  |
| codex-acp | agent-via-blueprint | pass | 2.7s |  |
| codex-acp | elicitation-acp | xfail | 9.7s | [xfail: codex-acp does not advertise or send session/elicitation (uses permission requests instead)] Agent did not trigger session_elicitation |
| codex-acp | single-prompt | pass | 2.7s |  |
| claude-code | agent-via-blueprint | pass | 1.4s |  |
| claude-code | elicitation-claude | pass | 3.3s |  |
| claude-code | single-prompt | pass | 1.3s |  |
