import type { UseCase } from "../types.js";
import singlePrompt from "./single-prompt.js";

/**
 * Demonstrates using a pre-built blueprint with agents baked in.
 *
 * This use case shows the `provisionOverridesByAgent` pattern for switching
 * from catalog install to blueprint install. The `axon-agents` blueprint has
 * agents pre-installed, giving the fastest cold-start and reproducible environment.
 *
 * The test body is identical to single-prompt — the interesting part is the
 * provisioning configuration, not the prompt logic.
 *
 * Prerequisites: The `axon-agents` blueprint must exist on your Runloop account.
 * Run `bun run build-blueprint` from the repo root to create it.
 */
export default {
  name: "agent-via-blueprint",
  description: "Use pre-built blueprint with agents baked in",
  protocols: ["acp", "claude"],
  timeoutMs: 30_000,

  provisionOverridesByAgent: {
    opencode: {
      install: { kind: "blueprint", blueprint: "axon-agents" },
      brokerMount: {
        agentBinary: "/home/user/.opencode/bin/opencode",
        launchArgs: ["acp"],
      },
    },
    "codex-acp": {
      install: { kind: "blueprint", blueprint: "axon-agents" },
      brokerMount: {
        agentBinary: "/usr/local/bin/codex-acp",
        workingDirectory: "/home/user",
      },
    },
    "claude-code": {
      install: { kind: "blueprint", blueprint: "axon-agents" },
      brokerMount: {
        agentBinary: "/home/user/.local/bin/claude",
        launchArgs: ["--dangerously-skip-permissions"],
      },
    },
  },

  run: singlePrompt.run,
} satisfies UseCase;
