import type { AgentConfig } from "./types.js";

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
    name: "claude-code",
    protocol: "claude",
    blueprint: "runloop/agents",
    mount: {
      protocol: "claude_json",
      launch_args: ["--dangerously-skip-permissions"],
    },
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
    },
  },
  // TODO: claude-acp hangs during ACP initialization — investigate and re-enable
  // {
  //   name: "claude-acp",
  //   protocol: "acp",
  //   blueprint: "runloop/agents",
  //   mount: {
  //     protocol: "acp",
  //     agent_binary: "claude",
  //     launch_args: ["acp"],
  //   },
  //   env: {
  //     ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  //   },
  // },
];
