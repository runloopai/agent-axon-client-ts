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
| opencode | agent-via-blueprint | pass | 2.3s |  |
| opencode | elicitation-acp | xfail | 13.8s | [xfail: ACP protocol has not added full elicitation support yet] Agent did not trigger session_elicitation |
| opencode | single-prompt | pass | 1.8s |  |
| codex-acp | agent-via-blueprint | pass | 2.3s |  |
| codex-acp | elicitation-acp | xfail | 10.5s | [xfail: codex-acp does not advertise or send session/elicitation (uses permission requests instead)] Agent did not trigger session_elicitation |
| codex-acp | single-prompt | pass | 3.4s |  |
| qwen | agent-via-blueprint | pass | 3.2s |  |
| qwen | elicitation-acp | xfail | 11.7s | [xfail: qwen does not advertise or send session/elicitation] Agent did not trigger session_elicitation |
| qwen | single-prompt | pass | 2.9s |  |
| claude-code | agent-via-blueprint | pass | 1.8s |  |
| claude-code | elicitation-claude | pass | 12.8s |  |
| claude-code | single-prompt | pass | 2.0s |  |
