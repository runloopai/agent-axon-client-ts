# Remote Agents SDK — Compatibility Matrix

SDK Version: 0.4.3

## Protocol × Feature

| Use Case | ACP | Claude |
|----------|-----|--------|
| agent-via-blueprint | pass | pass |
| elicitation-acp | xfail | N/A |
| elicitation-claude | N/A | fail |
| mcp-server | fail | pass |
| single-prompt | pass | pass |

## ACP Agent × Feature

| Use Case | opencode | codex-acp | qwen | gemini-cli |
|----------|------------|------------|------------|------------|
| agent-via-blueprint | pass | pass | skip | skip |
| elicitation-acp | xfail | xfail | xfail | xfail |
| mcp-server | fail | fail | pass | fail |
| single-prompt | pass | pass | pass | pass |

---

## Run Details

| Agent | Use Case | Status | Duration | Notes |
|-------|----------|--------|----------|-------|
| opencode | agent-via-blueprint | pass | 5.7s |  |
| opencode | elicitation-acp | xfail | 16.8s | [xfail: ACP protocol has not added full elicitation support yet] Agent did not trigger session_elicitation |
| opencode | mcp-server | fail | 29.9s | Agent did not invoke an MCP tool from "deepwiki" within 20000ms |
| opencode | single-prompt | pass | 5.3s |  |
| codex-acp | agent-via-blueprint | pass | 1.9s |  |
| codex-acp | elicitation-acp | xfail | 10.0s | [xfail: codex-acp does not advertise or send session/elicitation (uses permission requests instead)] Agent did not trigger session_elicitation |
| codex-acp | mcp-server | fail | 23.6s | Agent did not invoke an MCP tool from "deepwiki" within 20000ms |
| codex-acp | single-prompt | pass | 1.8s |  |
| qwen | agent-via-blueprint | skip | 0.0s | No blueprint override defined for qwen — add an entry to BLUEPRINT_OVERRIDES to test this agent via blueprint |
| qwen | elicitation-acp | xfail | 12.4s | [xfail: qwen does not advertise or send session/elicitation] Agent did not trigger session_elicitation |
| qwen | mcp-server | pass | 7.9s |  |
| qwen | single-prompt | pass | 2.3s |  |
| gemini-cli | agent-via-blueprint | skip | 0.0s | No blueprint override defined for gemini-cli — add an entry to BLUEPRINT_OVERRIDES to test this agent via blueprint |
| gemini-cli | elicitation-acp | xfail | 14.6s | [xfail: gemini-cli does not advertise or send session/elicitation] Agent did not trigger session_elicitation |
| gemini-cli | mcp-server | fail | 30.0s | Timeout (30000ms): mcp-server execution |
| gemini-cli | single-prompt | pass | 5.7s |  |
| claude-code | agent-via-blueprint | pass | 1.8s |  |
| claude-code | elicitation-claude | fail | 20.0s | Timeout (20000ms): elicitation-claude execution |
| claude-code | mcp-server | pass | 7.2s |  |
| claude-code | single-prompt | pass | 1.6s |  |
