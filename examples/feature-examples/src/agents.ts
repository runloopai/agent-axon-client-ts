import type { AgentConfig } from "./types.js";

// API keys are injected via secrets in scaffold.ts, not here.
export const AGENTS: AgentConfig[] = [
  {
    name: "opencode",
    protocol: "acp",
    blueprint: "runloop/agents",
    mount: {
      protocol: "acp",
      agent_binary: "opencode",
      launch_args: ["acp"],
    },
  },
  {
    name: "codex-acp",
    protocol: "acp",
    blueprint: "runloop/agents",
    mount: {
      protocol: "acp",
      agent_binary: "codex-acp",
    },
    secrets: { OPENAI_API_KEY: "OPENAI_API_KEY" },
  },
  {
    name: "claude-code",
    protocol: "claude",
    blueprint: "runloop/agents",
    mount: {
      protocol: "claude_json",
      launch_args: ["--dangerously-skip-permissions"],
    },
    secrets: { ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY" },
  },
];
