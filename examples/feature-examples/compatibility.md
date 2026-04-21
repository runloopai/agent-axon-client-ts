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

| Use Case | opencode | codex-acp | qwen | gemini-cli |
|----------|------------|------------|------------|------------|
| agent-via-blueprint | pass | pass | pass | pass |
| elicitation-acp | xfail | xfail | xfail | xfail |
| single-prompt | pass | pass | pass | pass |

---

## Run Details

| Agent | Use Case | Status | Duration | Notes |
|-------|----------|--------|----------|-------|
| opencode | agent-via-blueprint | pass | 1.8s |  |
| opencode | elicitation-acp | xfail | 9.8s | [xfail: ACP protocol has not added full elicitation support yet] Agent did not trigger session_elicitation |
| opencode | single-prompt | pass | 1.6s |  |
| codex-acp | agent-via-blueprint | pass | 2.0s |  |
| codex-acp | elicitation-acp | xfail | 10.2s | [xfail: codex-acp does not advertise or send session/elicitation (uses permission requests instead)] Agent did not trigger session_elicitation |
| codex-acp | single-prompt | pass | 1.7s |  |
| qwen | agent-via-blueprint | pass | 3.6s |  |
| qwen | elicitation-acp | xfail | 11.1s | [xfail: qwen does not advertise or send session/elicitation] Agent did not trigger session_elicitation |
| qwen | single-prompt | pass | 3.3s |  |
| gemini-cli | agent-via-blueprint | pass | 3.0s |  |
| gemini-cli | elicitation-acp | xfail | 20.0s | [xfail: gemini-cli does not advertise or send session/elicitation] Timeout (20000ms): elicitation-acp execution |
| gemini-cli | single-prompt | pass | 2.3s |  |
| claude-code | agent-via-blueprint | pass | 1.5s |  |
| claude-code | elicitation-claude | pass | 5.1s |  |
| claude-code | single-prompt | pass | 1.8s |  |
