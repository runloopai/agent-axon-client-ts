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
| opencode | elicitation-acp | xfail | 121.7s | [xfail: ACP protocol has not added full elicitation support yet] Agent did not trigger session_elicitation |
| opencode | single-prompt | pass | 113.1s |  |
| codex-acp | elicitation-acp | xfail | 119.7s | [xfail: codex-acp does not advertise or send session/elicitation (uses permission requests instead)] Agent did not trigger session_elicitation |
| codex-acp | single-prompt | pass | 114.7s |  |
| claude-code | elicitation-claude | pass | 127.1s |  |
| claude-code | single-prompt | pass | 5.4s |  |
