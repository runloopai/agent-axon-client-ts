# Agent Axon Client — Compatibility Matrix

SDK Version: 0.4.2

## Protocol × Feature

| Use Case | ACP | Claude |
|----------|-----|--------|
| elicitation-acp | xfail | N/A |
| elicitation-claude | N/A | pass |
| single-prompt | pass | pass |

## ACP Agent × Feature

| Use Case | opencode | codex-acp |
|----------|------------|------------|
| elicitation-acp | xfail | xfail |
| single-prompt | pass | pass |

---

## Run Details

| Agent | Use Case | Status | Duration | Notes |
|-------|----------|--------|----------|-------|
| opencode | elicitation-acp | xfail | 7.5s | [xfail: ACP protocol has not added full elicitation support yet] Agent did not trigger session_elicitation |
| opencode | single-prompt | pass | 2.5s |  |
| codex-acp | elicitation-acp | xfail | 8.1s | [xfail: codex-acp does not advertise or send session/elicitation (uses permission requests instead)] Agent did not trigger session_elicitation |
| codex-acp | single-prompt | pass | 3.0s |  |
| claude-code | elicitation-claude | pass | 3.8s |  |
| claude-code | single-prompt | pass | 4.0s |  |
