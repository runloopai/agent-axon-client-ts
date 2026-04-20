import type { AgentConfig } from "./types.js";

// API keys are injected via secrets in scaffold.ts, not here.
// Uses the axon-agents blueprint with pre-installed agent binaries.
export const AGENTS: AgentConfig[] = [
  {
    name: "opencode",
    protocol: "acp",
    blueprint: "axon-agents",
    mount: {
      protocol: "acp",
      agent_binary: "/home/user/.opencode/bin/opencode",
      launch_args: ["acp"],
    },
  },
  {
    name: "codex-acp",
    protocol: "acp",
    blueprint: "axon-agents",
    mount: {
      protocol: "acp",
      agent_binary: "/usr/local/bin/codex-acp",
      working_directory: "/home/user",
    },
    secrets: { OPENAI_API_KEY: "OPENAI_API_KEY" },
    acpAuthMethodId: "openai-api-key",
  },
  {
    name: "claude-code",
    protocol: "claude",
    blueprint: "axon-agents",
    mount: {
      protocol: "claude_json",
      agent_binary: "/home/user/.local/bin/claude",
      launch_args: ["--dangerously-skip-permissions"],
    },
    secrets: { ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY" },
  },
];
