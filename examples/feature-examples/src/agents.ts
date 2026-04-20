import type { AgentConfig } from "./types.js";

// API keys are injected via secrets in scaffold.ts, not here.
// Uses agent mounts to install agents dynamically on the starter image.
export const AGENTS: AgentConfig[] = [
  {
    name: "opencode",
    protocol: "acp",
    blueprint: "runloop/starter-x86_64",
    agentMount: { agent_name: "opencode" },
    mount: {
      protocol: "acp",
      agent_binary: "opencode",
      launch_args: ["acp"],
    },
  },
  {
    name: "codex-acp",
    protocol: "acp",
    blueprint: "runloop/starter-x86_64",
    agentMount: { agent_name: "codex-acp" },
    mount: {
      protocol: "acp",
      agent_binary: "codex-acp",
      working_directory: "/home/user",
    },
    secrets: { OPENAI_API_KEY: "OPENAI_API_KEY" },
    acpAuthMethodId: "openai-api-key",
  },
  {
    name: "claude-code",
    protocol: "claude",
    blueprint: "runloop/starter-x86_64",
    agentMount: { agent_name: "claude-code" },
    mount: {
      protocol: "claude_json",
      agent_binary: "claude",
      launch_args: ["--dangerously-skip-permissions"],
    },
    secrets: { ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY" },
  },
];
