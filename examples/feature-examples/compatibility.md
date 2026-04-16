# Agent Axon Client — Compatibility Matrix

Generated: 2026-04-16T23:11:12.457Z
SDK Version: 0.4.2

## Protocol × Feature

| Use Case | ACP | Claude |
|----------|-----|--------|
| elicitation-acp | fail | N/A |
| elicitation-claude | N/A | fail |
| single-prompt | fail | fail |

## ACP Agent × Feature

| Use Case | opencode | codex-acp |
|----------|------------|------------|
| elicitation-acp | xfail | fail |
| single-prompt | fail | pass |

---

## Run Details

| Agent | Use Case | Status | Duration | Notes |
|-------|----------|--------|----------|-------|
| opencode | elicitation-acp | xfail | 12.5s | [xfail: ACP protocol has not added full elicitation support yet] Timeout (10000ms): ACP initialize |
| opencode | single-prompt | fail | 12.1s | Timeout (10000ms): ACP initialize |
| codex-acp | elicitation-acp | fail | 10.9s | Agent did not trigger session_elicitation |
| codex-acp | single-prompt | pass | 6.3s |  |
| claude-code | elicitation-claude | fail | 12.6s | Timeout (10000ms): Claude initialize |
| claude-code | single-prompt | fail | 11.9s | Timeout (10000ms): Claude initialize |
