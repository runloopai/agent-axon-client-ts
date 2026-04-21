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
| opencode | agent-via-blueprint | pass | 1.7s |  |
| opencode | elicitation-acp | xfail | 9.6s | [xfail: ACP protocol has not added full elicitation support yet] Agent did not trigger session_elicitation |
| opencode | single-prompt | pass | 1.7s |  |
| codex-acp | agent-via-blueprint | pass | 2.2s |  |
| codex-acp | elicitation-acp | xfail | 10.6s | [xfail: codex-acp does not advertise or send session/elicitation (uses permission requests instead)] Agent did not trigger session_elicitation |
| codex-acp | single-prompt | pass | 2.2s |  |
| qwen | agent-via-blueprint | pass | 3.0s |  |
| qwen | elicitation-acp | xfail | 11.4s | [xfail: qwen does not advertise or send session/elicitation] Agent did not trigger session_elicitation |
| qwen | single-prompt | pass | 2.9s |  |
| gemini-cli | agent-via-blueprint | pass | 3.7s |  |
| gemini-cli | elicitation-acp | xfail | 12.7s | [xfail: gemini-cli does not advertise or send session/elicitation] Agent did not trigger session_elicitation |
| gemini-cli | single-prompt | pass | 3.8s |  |
| claude-code | agent-via-blueprint | pass | 2.2s |  |
| claude-code | elicitation-claude | pass | 12.4s |  |
| claude-code | single-prompt | pass | 1.8s |  |
