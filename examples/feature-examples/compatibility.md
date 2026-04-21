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

| Use Case | opencode | codex-acp | qwen |
|----------|------------|------------|------------|
| agent-via-blueprint | pass | pass | pass |
| elicitation-acp | xfail | xfail | xfail |
| single-prompt | pass | pass | pass |

---

## Run Details

| Agent | Use Case | Status | Duration | Notes |
|-------|----------|--------|----------|-------|
| opencode | agent-via-blueprint | pass | 2.1s |  |
| opencode | elicitation-acp | xfail | 6.7s | [xfail: ACP protocol has not added full elicitation support yet] Agent did not trigger session_elicitation |
| opencode | single-prompt | pass | 2.0s |  |
| codex-acp | agent-via-blueprint | pass | 2.9s |  |
| codex-acp | elicitation-acp | xfail | 7.2s | [xfail: codex-acp does not advertise or send session/elicitation (uses permission requests instead)] Agent did not trigger session_elicitation |
| codex-acp | single-prompt | pass | 2.3s |  |
| qwen | agent-via-blueprint | pass | 3.9s |  |
| qwen | elicitation-acp | xfail | 8.9s | [xfail: qwen does not advertise or send session/elicitation] Agent did not trigger session_elicitation |
| qwen | single-prompt | pass | 4.2s |  |
| claude-code | agent-via-blueprint | pass | 1.2s |  |
| claude-code | elicitation-claude | pass | 14.0s |  |
| claude-code | single-prompt | pass | 1.4s |  |
